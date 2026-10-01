import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Exercise the real TypeScript modules without adding a browser test runtime.
// React's external-store boundary is mocked so reads can be resolved in any order.
function loadModule(path, overrides = {}, globals = {}, cache = new Map()) {
  const filename = resolve(root, path);
  if (cache.has(filename)) return cache.get(filename);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  cache.set(filename, exports);
  runInNewContext(
    outputText,
    {
      exports,
      require(name) {
        if (name in overrides) return overrides[name];
        if (name.startsWith(".")) {
          return loadModule(resolve(dirname(filename), `${name}.ts`), overrides, globals, cache);
        }
        return require(name);
      },
      ...globals,
    },
    { filename },
  );
  return exports;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createHarness({ browser = true } = {}) {
  const listeners = new Set();
  const pending = { connection: [], games: [], repertoire: [], pinned: [] };
  const calls = { connection: 0, games: 0, repertoire: 0, pinned: 0 };
  const mounted = [];
  const fetcher = (store) => () => {
    calls[store]++;
    return new Promise((resolve, reject) => pending[store].push({ resolve, reject }));
  };
  const hooks = loadModule(
    "src/lib/chess/hooks.ts",
    {
      "./storage": {
        getConnection: fetcher("connection"),
        getAllGames: fetcher("games"),
        getRepertoire: fetcher("repertoire"),
        getPinned: fetcher("pinned"),
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      react: {
        useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
          const handle = {
            snapshot: browser ? getSnapshot : getServerSnapshot,
            notifications: 0,
            unmount: () => {},
          };
          if (browser) handle.unmount = subscribe(() => handle.notifications++);
          mounted.push(handle);
          return handle.snapshot();
        },
      },
    },
    browser ? { window: {} } : {},
  );
  return {
    calls,
    mount(name) {
      hooks[name]();
      return mounted.pop();
    },
    notify(store) {
      for (const listener of listeners) listener(store);
    },
    async resolve(store, value) {
      assert.ok(pending[store].length, `Expected a pending ${store} read`);
      pending[store].shift().resolve(value);
      await flush();
    },
    async reject(store, error) {
      pending[store].shift().reject(error);
      await flush();
    },
  };
}

test("multiple consumers share one read and preserve snapshots during navigation", async () => {
  const app = createHarness();
  const first = app.mount("useGames");
  const second = app.mount("useGames");
  const third = app.mount("useGames");
  assert.equal(app.calls.games, 1);
  const games = [{ id: "game-1" }];
  await app.resolve("games", games);
  assert.equal(first.snapshot(), games);
  assert.equal(second.snapshot(), games);
  assert.equal(third.snapshot(), games);
  first.unmount();
  second.unmount();
  third.unmount();
  const nextPage = app.mount("useGames");
  assert.equal(app.calls.games, 1);
  assert.equal(nextPage.snapshot(), games);
});

test("pinning a position refreshes only pinned data and keeps games stable", async () => {
  const app = createHarness();
  const games = app.mount("useGames");
  const status = app.mount("useChessDataStatus");
  const data = [{ id: "game-1" }];
  await app.resolve("games", data);
  await app.resolve("connection", null);
  await app.resolve("repertoire", []);
  await app.resolve("pinned", []);
  assert.equal(status.snapshot().loading, false);
  const settled = status.snapshot();
  app.notify("pinned");
  assert.deepEqual(app.calls, { connection: 1, games: 1, repertoire: 1, pinned: 2 });
  assert.equal(games.snapshot(), data);
  assert.equal(status.snapshot(), settled);
  await app.resolve("pinned", [{ id: "position-1" }]);
  assert.equal(games.snapshot(), data);
  assert.equal(status.snapshot(), settled);
});

test("a write arriving during a read cannot publish its stale result", async () => {
  const app = createHarness();
  const games = app.mount("useGames");
  const initial = games.snapshot();
  app.notify("games");
  app.notify("games");
  assert.equal(app.calls.games, 1);
  await app.resolve("games", [{ id: "old" }]);
  assert.equal(app.calls.games, 2);
  assert.equal(games.snapshot(), initial);
  const latest = [{ id: "latest" }];
  await app.resolve("games", latest);
  assert.equal(games.snapshot(), latest);
  assert.equal(games.notifications, 1);
});

test("unobserved mutations invalidate the cache and refresh on next mount", async () => {
  const app = createHarness();
  const games = app.mount("useGames");
  await app.resolve("games", [{ id: "before" }]);
  games.unmount();
  app.notify("games");
  assert.equal(app.calls.games, 1);
  const nextPage = app.mount("useGames");
  assert.equal(app.calls.games, 2);
  const latest = [{ id: "after" }];
  await app.resolve("games", latest);
  assert.equal(nextPage.snapshot(), latest);
});

test("failed reads expose an error and recover after a subsequent mutation", async () => {
  const app = createHarness();
  const status = app.mount("useChessDataStatus");
  await app.resolve("connection", null);
  await app.resolve("repertoire", []);
  await app.resolve("pinned", []);
  await app.reject("games", new Error("Database unavailable"));
  assert.equal(status.snapshot().loading, false);
  assert.ok(status.snapshot().error);
  app.notify("games");
  await app.resolve("games", []);
  assert.equal(status.snapshot().error, null);
});

test("server snapshots are stable and never open the browser database", () => {
  const app = createHarness({ browser: false });
  const first = app.mount("useGames");
  const second = app.mount("useGames");
  const status = app.mount("useChessDataStatus");
  assert.equal(first.snapshot(), second.snapshot());
  assert.equal(first.snapshot().length, 0);
  assert.equal(status.snapshot().loading, true);
  assert.deepEqual(app.calls, { connection: 0, games: 0, repertoire: 0, pinned: 0 });
});

test("cached PGN parsing retains comments, variations, and independent move arrays", () => {
  const { pgnToSanMoves, parsePgnMeta } = loadModule("src/lib/chess/pgn.ts");
  const pgn =
    '[White "Player"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 {Good move} e5 2. Nf3 (2. Bc4) Nc6 3. Bb5 a6 1-0';
  const moves = pgnToSanMoves(pgn);
  assert.deepEqual([...moves], ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  moves.pop();
  assert.equal(pgnToSanMoves(pgn).length, 6);
  assert.equal(parsePgnMeta(pgn).movesCount, 6);
  assert.equal(pgnToSanMoves("1. e5 impossible").length, 0);
});

test("opening caches preserve branch counts, colors, legal FENs, and ply limits", () => {
  const { buildOpeningTree, serializeTree } = loadModule("src/lib/chess/opening-tree.ts");
  const games = [
    { myColor: "white", result: "win", pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6" },
    { myColor: "white", result: "loss", pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5" },
    { myColor: "black", result: "draw", pgn: "1. d4 d5 2. c4 e6" },
  ];
  const white = buildOpeningTree(games, "white", 4);
  assert.equal(white.count, 2);
  assert.equal(white.wins, 1);
  assert.equal(white.losses, 1);
  const branch = white.children
    .get("e4")
    .children.get("e5")
    .children.get("Nf3")
    .children.get("Nc6");
  assert.equal(branch.count, 2);
  assert.equal(branch.children.size, 0);
  assert.equal(branch.fen, "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
  assert.equal(buildOpeningTree(games, "white", 4), white);
  assert.equal(serializeTree(white), serializeTree(white));
  assert.equal(buildOpeningTree(games, "black", 4).count, 1);
  assert.notEqual(buildOpeningTree([...games], "white", 4), white);
  assert.notEqual(buildOpeningTree(games, "white", 6), white);
});

test("Chess.com import yields between parsing batches without losing games", async () => {
  let yields = 0;
  const fixtures = Array.from({ length: 25 }, (_, index) => ({
    url: `https://www.chess.com/game/live/${index}`,
    end_time: index,
    pgn: "1. e4 e5",
    white: { username: "player" },
    black: { username: "opponent" },
  }));
  const { importChessCom } = loadModule(
    "src/lib/chess/import.ts",
    { "./pgn": { buildStoredGame: (game) => ({ id: game.gameId }) } },
    {
      fetch: async (url) => ({
        ok: true,
        json: async () =>
          url.endsWith("/archives")
            ? { archives: ["https://archive.test/month"] }
            : { games: fixtures },
      }),
      setTimeout(callback) {
        yields++;
        queueMicrotask(callback);
      },
    },
  );
  const progress = [];
  const result = await importChessCom("player", 6, (value) => progress.push(value));
  assert.equal(result.games.length, 25);
  assert.equal(result.errors.length, 0);
  assert.equal(yields, 2);
  assert.equal(progress.at(-1).parsed, 25);
});

test("Lichess streaming import yields between batches and keeps every record", async () => {
  let yields = 0;
  let delivered = false;
  const data =
    Array.from({ length: 25 }, (_, index) =>
      JSON.stringify({ id: String(index), pgn: "1. d4 d5" }),
    ).join("\n") + "\n";
  const { importLichess } = loadModule(
    "src/lib/chess/import.ts",
    { "./pgn": { buildStoredGame: (game) => ({ id: game.gameId }) } },
    {
      fetch: async () => ({
        ok: true,
        body: {
          getReader: () => ({
            async read() {
              if (delivered) return { done: true };
              delivered = true;
              return { done: false, value: new TextEncoder().encode(data) };
            },
          }),
        },
      }),
      TextDecoder,
      setTimeout(callback) {
        yields++;
        queueMicrotask(callback);
      },
    },
  );
  const result = await importLichess("player");
  assert.equal(result.games.length, 25);
  assert.equal(result.errors.length, 0);
  assert.equal(yields, 2);
});
