import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadModule(path, globals = {}) {
  const filename = resolve(path);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(
    outputText,
    { exports, AbortController, DOMException, setTimeout, clearTimeout, ...globals },
    { filename },
  );
  return exports;
}

const manifest = {
  version: "test-v1",
  source: "Lichess",
  sourceUrl: "https://database.lichess.org/#puzzles",
  license: "CC0",
  generatedAt: "2026-10-24T00:00:00Z",
  minRating: 400,
  maxRating: 3000,
  bucketSize: 100,
  buckets: Array.from({ length: 27 }, (_, index) => ({
    rating: 400 + index * 100,
    count: 600,
    url: `/puzzles/${400 + index * 100}.json`,
  })),
};

function shard(rating) {
  return Array.from({ length: 600 }, (_, index) => ({
    id: `${rating}-${index}`,
    rating,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moves: ["e2e4", "e7e5"],
    themes: ["opening"],
    gameUrl: "https://lichess.org/abcdefgh#1",
  }));
}

function catalogHarness(override) {
  const calls = [];
  const catalog = loadModule("src/lib/training/catalog.ts", {
    async fetch(url, options) {
      calls.push(url);
      if (override) {
        const result = await override(url, options);
        if (result) return result;
      }
      const data =
        url === "/puzzles/manifest.json" ? manifest : shard(Number(url.match(/(\d+)\.json$/)[1]));
      return { ok: true, json: async () => data };
    },
  });
  return { ...catalog, calls };
}

test("collection downloads only three nearest-hundred bands and reuses validated reads", async () => {
  const catalog = catalogHarness();
  const result = await catalog.loadCollectionPuzzles(1549);
  assert.equal(result.baseRating, 1500);
  assert.equal(result.manifestVersion, "test-v1");
  assert.equal(result.puzzles.length, 1800);
  assert.deepEqual([...new Set(result.puzzles.map((puzzle) => puzzle.rating))], [1500, 1600, 1700]);
  assert.deepEqual(catalog.calls, [
    "/puzzles/manifest.json",
    "/puzzles/1500.json",
    "/puzzles/1600.json",
    "/puzzles/1700.json",
  ]);
  await catalog.loadCollectionPuzzles(1500);
  assert.equal(catalog.calls.length, 4);
});

test("collection preserves the +100 and +200 bands at both catalogue boundaries", async () => {
  const catalog = catalogHarness();
  assert.equal((await catalog.loadCollectionPuzzles(100)).baseRating, 400);
  const high = await catalog.loadCollectionPuzzles(3500);
  assert.equal(high.baseRating, 2800);
  assert.deepEqual([...new Set(high.puzzles.map((puzzle) => puzzle.rating))], [2800, 2900, 3000]);
  await assert.rejects(catalog.loadCollectionPuzzles(Number.NaN), /valid puzzle rating/);
});

test("a failed shard prevents partial collection creation and remains retryable", async () => {
  let shouldFail = true;
  const catalog = catalogHarness((url) => {
    if (url === "/puzzles/1600.json" && shouldFail) return { ok: false, status: 503 };
  });
  await assert.rejects(catalog.loadCollectionPuzzles(1500), /503/);
  shouldFail = false;
  assert.equal((await catalog.loadCollectionPuzzles(1500)).puzzles.length, 1800);
  assert.equal(catalog.calls.filter((url) => url === "/puzzles/1600.json").length, 2);
});

test("bad manifests, duplicate puzzle IDs and corrupt UCI moves cannot enter a collection", async () => {
  const badManifest = catalogHarness((url) => {
    if (url.endsWith("manifest.json")) {
      return { ok: true, json: async () => ({ ...manifest, buckets: manifest.buckets.slice(1) }) };
    }
  });
  await assert.rejects(badManifest.loadCollectionPuzzles(1500), /catalogue is invalid/);

  for (const corrupt of [
    (puzzles) => (puzzles[1].id = puzzles[0].id),
    (puzzles) => (puzzles[0].moves = ["e2e4", "f9g8"]),
    (puzzles) => puzzles.pop(),
  ]) {
    const catalog = catalogHarness((url) => {
      if (url === "/puzzles/1500.json") {
        const puzzles = shard(1500);
        corrupt(puzzles);
        return { ok: true, json: async () => puzzles };
      }
    });
    await assert.rejects(catalog.loadCollectionPuzzles(1500), /could not be loaded correctly/);
  }
});

test("pre-aborted requests do not fetch, and an aborted download is not cached", async () => {
  const controller = new AbortController();
  controller.abort();
  const catalog = catalogHarness();
  await assert.rejects(catalog.loadCollectionPuzzles(1500, controller.signal), {
    name: "AbortError",
  });
  assert.equal(catalog.calls.length, 0);

  const midflight = new AbortController();
  let interrupted = true;
  const retry = catalogHarness((url) => {
    if (url === "/puzzles/manifest.json" && interrupted) midflight.abort();
  });
  await assert.rejects(retry.loadCollectionPuzzles(1500, midflight.signal), { name: "AbortError" });
  interrupted = false;
  await retry.loadCollectionPuzzles(1500);
  assert.equal(retry.calls.filter((url) => url === "/puzzles/manifest.json").length, 2);
});

test("calibration loads a nearby band and never repeats excluded IDs", async () => {
  const catalog = catalogHarness();
  const excluded = new Set(
    shard(1500)
      .slice(0, -1)
      .map((puzzle) => puzzle.id),
  );
  const puzzle = await catalog.loadCalibrationPuzzle(1499, excluded);
  assert.equal(puzzle.id, "1500-599");
  excluded.add(puzzle.id);
  await assert.rejects(catalog.loadCalibrationPuzzle(1499, [...excluded]), /No new calibration/);
});

test("the bundled Lichess catalogue loads a complete collection across its supported range", async () => {
  const catalogue = loadModule("src/lib/training/catalog.ts", {
    fetch: async (url) => ({
      ok: true,
      json: async () => JSON.parse(readFileSync(resolve("public", url.slice(1)), "utf8")),
    }),
  });
  for (let rating = 400; rating <= 2800; rating += 100) {
    const result = await catalogue.loadCollectionPuzzles(rating);
    assert.equal(result.baseRating, rating);
    assert.equal(result.puzzles.length, 1800);
    assert.equal(new Set(result.puzzles.map((puzzle) => puzzle.id)).size, 1800);
  }
});

const connection = { username: "Test Player", platform: "lichess", linkedAt: 1, lastImport: null };

test("rating setup uses established Lichess puzzle rating and escapes usernames", async () => {
  let requested;
  const { fetchConnectedPuzzleRating } = loadModule("src/lib/training/rating.ts", {
    fetch: async (url) => {
      requested = url;
      return {
        ok: true,
        json: async () => ({
          perfs: { puzzle: { rating: 1573, games: 42 }, blitz: { rating: 2100 } },
        }),
      };
    },
  });
  const result = await fetchConnectedPuzzleRating(connection);
  assert.equal(result.rating, 1573);
  assert.equal(result.source, "lichess");
  assert.match(requested, /Test%20Player\?profile=false$/);
});

test("missing, provisional and lightly played ratings fall back to calibration", async () => {
  for (const puzzle of [
    undefined,
    { rating: 1500, games: 99, prov: true },
    { rating: 1500, games: 19 },
    { rating: "1500", games: 50 },
  ]) {
    const { fetchConnectedPuzzleRating } = loadModule("src/lib/training/rating.ts", {
      fetch: async () => ({
        ok: true,
        json: async () => ({ perfs: { puzzle, rapid: { rating: 1900, games: 100 } } }),
      }),
    });
    assert.equal(await fetchConnectedPuzzleRating(connection), null);
  }
});

test("Chess.com connections do not request or convert platform ratings", async () => {
  let calls = 0;
  const { fetchConnectedPuzzleRating } = loadModule("src/lib/training/rating.ts", {
    fetch() {
      calls++;
      throw new Error("Unexpected network request");
    },
  });
  assert.equal(await fetchConnectedPuzzleRating({ ...connection, platform: "chess.com" }), null);
  assert.equal(calls, 0);
});

test("profile network failures and timeouts allow local calibration", async () => {
  const offline = loadModule("src/lib/training/rating.ts", {
    fetch: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(await offline.fetchConnectedPuzzleRating(connection), null);

  let timeoutDuration;
  const timedOut = loadModule("src/lib/training/rating.ts", {
    setTimeout(callback, milliseconds) {
      timeoutDuration = milliseconds;
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
    fetch: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")));
      }),
  });
  assert.equal(await timedOut.fetchConnectedPuzzleRating(connection), null);
  assert.equal(timeoutDuration, 8000);
});

test("five placement answers adjust difficulty with decreasing steps", () => {
  const { updateCalibrationRating, INITIAL_CALIBRATION_RATING, CALIBRATION_LENGTH } = loadModule(
    "src/lib/training/rating.ts",
  );
  assert.equal(INITIAL_CALIBRATION_RATING, 1500);
  assert.equal(CALIBRATION_LENGTH, 5);
  let rating = INITIAL_CALIBRATION_RATING;
  const expected = [1800, 1600, 1700, 1600, 1700];
  [true, false, true, false, true].forEach((correct, index) => {
    rating = updateCalibrationRating(rating, correct, index);
    assert.equal(rating, expected[index]);
  });
  assert.equal(updateCalibrationRating(rating, true, 5), rating);
});
