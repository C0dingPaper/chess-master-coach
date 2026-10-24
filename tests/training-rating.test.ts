import assert from "node:assert/strict";
import test from "node:test";
import { fetchTrainingRatings, fetchVerifiedPuzzleRating } from "../src/lib/training/rating.ts";
import type { Connection } from "../src/lib/chess/types.ts";
const connection: Connection = {
  username: "Bucket_Head",
  platform: "lichess",
  linkedAt: 1,
  lastImport: null,
};
const originalFetch = globalThis.fetch;

test("uses Bucket_Head's exact puzzle rating 1749, not rapid 1311 or rounded 1700", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let request: RequestInit | undefined;
  globalThis.fetch = async (_url, options) => {
    request = options;
    return new Response(
      JSON.stringify({
        perfs: { rapid: { rating: 1311, games: 588 }, puzzle: { rating: 1749, games: 3975 } },
      }),
    );
  };
  const rating = await fetchVerifiedPuzzleRating(connection);
  assert.equal(rating?.rating, 1749);
  assert.equal(rating?.username, "Bucket_Head");
  assert.equal(rating?.mode, "puzzle");
  assert.equal(rating?.platform, "lichess");
  assert.ok(rating!.checkedAt > 0);
  assert.equal(request?.cache, "no-store");
});

test("does not replace unavailable puzzle data with a playing or best rating", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        perfs: { rapid: { rating: 1317, games: 588 } },
        tactics: { highest: { rating: 1700 } },
      }),
    );
  assert.equal(await fetchVerifiedPuzzleRating(connection), null);
});

test("each successful fetch can observe a new current puzzle rating", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let current = 1749;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ perfs: { puzzle: { rating: current, games: 3975 } } }));
  assert.equal((await fetchVerifiedPuzzleRating(connection))?.rating, 1749);
  current = 1948;
  assert.equal((await fetchVerifiedPuzzleRating(connection))?.rating, 1948);
  current = 1949;
  assert.equal((await fetchVerifiedPuzzleRating(connection))?.rating, 1949);
});

test("one fresh profile provides separate puzzle difficulty and rapid progress snapshots", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  let requested: RequestInfo | URL | undefined;
  let request: RequestInit | undefined;
  globalThis.fetch = async (url, options) => {
    calls++;
    requested = url;
    request = options;
    return new Response(
      JSON.stringify({
        perfs: {
          rapid: { rating: 1311, games: 588 },
          puzzle: { rating: 1749, games: 3975 },
          blitz: { rating: 2100, games: 600 },
        },
      }),
    );
  };
  const result = await fetchTrainingRatings({ ...connection, username: " Bucket_Head " });
  assert.equal(calls, 1);
  assert.equal(requested, "https://lichess.org/api/user/Bucket_Head?profile=false");
  assert.equal(request?.cache, "no-store");
  assert.deepEqual(request?.headers, { Accept: "application/json" });
  assert.equal(result.puzzle?.rating, 1749);
  assert.equal(result.puzzle?.mode, "puzzle");
  assert.equal(result.playing?.rating, 1311);
  assert.equal(result.playing?.mode, "rapid");
  assert.equal(result.playing?.username, "Bucket_Head");
  assert.equal(result.playing?.platform, "lichess");
  assert.equal(result.playing?.provisional, false);
  assert.ok(result.playing!.checkedAt > 0);
  assert.equal(result.puzzle?.checkedAt, result.playing?.checkedAt);
});

test("fresh rapid rating detects 199 and 200 point gains independently of puzzle changes", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let rapid = 1311;
  let puzzle = 1749;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        perfs: { rapid: { rating: rapid, games: 588 }, puzzle: { rating: puzzle, games: 3975 } },
      }),
    );
  const first = await fetchTrainingRatings(connection);
  assert.equal(first.playing?.rating, 1311);
  puzzle = 1949;
  assert.equal((await fetchTrainingRatings(connection)).playing?.rating, 1311);
  rapid = 1510;
  const belowThreshold = await fetchTrainingRatings(connection);
  assert.equal(belowThreshold.playing!.rating - first.playing!.rating, 199);
  rapid = 1511;
  const atThreshold = await fetchTrainingRatings(connection);
  assert.equal(atThreshold.playing!.rating - first.playing!.rating, 200);
  assert.equal(atThreshold.puzzle?.rating, 1949);
});

test("unavailable or invalid rapid ratings never fall back to puzzle, blitz or highest rating", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  for (const rapid of [
    undefined,
    { rating: 1311, games: 100, prov: true },
    { rating: 1311, games: 0 },
    { rating: 1311, games: 1.5 },
    { rating: 1311, games: "100" },
    { rating: "1311", games: 100 },
    { rating: 1311.5, games: 100 },
    { rating: 99, games: 100 },
    { rating: 5001, games: 100 },
  ]) {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          perfs: {
            rapid,
            puzzle: { rating: 1749, games: 3975 },
            blitz: { rating: 2100, games: 600 },
          },
          highest: { rating: 2200 },
        }),
      );
    const result = await fetchTrainingRatings(connection);
    assert.equal(result.playing, null);
    assert.equal(result.puzzle?.rating, 1749);
  }
});

test("an explicitly selected game time control is used without falling back to rapid", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        perfs: {
          rapid: { rating: 1311, games: 588 },
          blitz: { rating: 1138, games: 1, prov: false },
        },
      }),
    );
  const blitz = await fetchTrainingRatings(connection, undefined, "blitz");
  assert.equal(blitz.playing?.rating, 1138);
  assert.equal(blitz.playing?.mode, "blitz");
  assert.equal(blitz.puzzle, null);
  assert.equal((await fetchTrainingRatings(connection, undefined, "classical")).playing, null);
});

test("aborted and unsupported connections do not request ratings", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected request");
  };
  const controller = new AbortController();
  controller.abort();
  const unavailable = { puzzle: null, playing: null };
  assert.deepEqual(await fetchTrainingRatings(connection, controller.signal), unavailable);
  assert.deepEqual(
    await fetchTrainingRatings({ ...connection, platform: "chess.com" }),
    unavailable,
  );
  assert.deepEqual(await fetchTrainingRatings({ ...connection, username: " " }), unavailable);
  assert.equal(calls, 0);
});

test("a midflight abort cannot publish either rating even if the response arrives", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const controller = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, options) => {
    requestSignal = options?.signal;
    controller.abort();
    return new Response(
      JSON.stringify({
        perfs: {
          rapid: { rating: 1311, games: 588 },
          puzzle: { rating: 1749, games: 3975 },
        },
      }),
    );
  };
  assert.deepEqual(await fetchTrainingRatings(connection, controller.signal), {
    puzzle: null,
    playing: null,
  });
  assert.equal(requestSignal?.aborted, true);
});

test("network errors, rate limits and malformed profiles leave both ratings unavailable", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  for (const fetcher of [
    async () => {
      throw new Error("offline");
    },
    async () => new Response("Too many requests", { status: 429 }),
    async () => new Response("invalid JSON"),
    async () => new Response(JSON.stringify({ perfs: [] })),
  ]) {
    globalThis.fetch = fetcher;
    assert.deepEqual(await fetchTrainingRatings(connection), { puzzle: null, playing: null });
  }
});
