import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { Chess } from "chess.js";
import {
  generateRepertoire,
  resolveOpening,
  positionKey,
  type OpeningReference,
  type BookLookup,
} from "../src/lib/chess/repertoire-generator.ts";
import type { StoredGame } from "../src/lib/chess/types.ts";

const references = JSON.parse(
  fs.readFileSync(new URL("../public/openings/lichess.json", import.meta.url), "utf8"),
) as OpeningReference[];
const root = references.find((entry) => entry.name === "Sicilian Defense: Old Sicilian")!;
const mockBook: BookLookup = async (fen) => {
  const board = new Chess(fen);
  const moves = board
    .moves({ verbose: true })
    .sort((a, b) => {
      // Prefer development and pawn progress to avoid artificial threefold repetition.
      const score = (m: typeof a) =>
        (m.piece === "p" ? 100 : 0) + (m.captured ? 50 : 0) + (m.san.includes("#") ? -1000 : 0);
      return score(b) - score(a) || a.san.localeCompare(b.san);
    })
    .slice(0, 4)
    .map((move, index) => ({
      uci: move.from + move.to + (move.promotion ?? ""),
      san: move.san,
      white: 100 - index * 15,
      black: 80 - index * 10,
      draws: 20,
    }));
  return {
    moves,
    white: moves.reduce((n, m) => n + m.white, 0),
    black: moves.reduce((n, m) => n + m.black, 0),
    draws: moves.reduce((n, m) => n + m.draws, 0),
  };
};

for (const color of ["white", "black"] as const) {
  test(`${color}: ten legal unique lines of exactly sixteen full moves and one own response per position`, async () => {
    const lines = await generateRepertoire(root, color, mockBook, new AbortController().signal);
    assert.equal(lines.length, 10);
    assert.equal(new Set(lines.map((line) => line.pgn)).size, 10);
    assert.ok(
      new Set(lines.map((line) => line.moves[color === "black" ? 4 : 5])).size > 1,
      "Preserve distinct early opponent replies",
    );
    const policy = new Map<string, string>();
    for (const line of lines) {
      assert.equal(line.moves.length, 32);
      const board = new Chess();
      board.loadPgn(line.pgn);
      assert.equal(board.history().length, 32);
      assert.equal(board.fen().split(" ")[5], "17");
      assert.deepEqual(line.moves.slice(0, 4), ["e4", "c5", "Nf3", "Nc6"]);
      board.reset();
      for (const move of line.moves) {
        const key = positionKey(board.fen());
        if (board.turn() === color[0]) {
          if (policy.has(key)) assert.equal(move, policy.get(key));
          policy.set(key, move);
        }
        board.move(move);
      }
    }
  });
}

test("missing continuation data never produces a shortened sixteen-move line", async () => {
  const lines = await generateRepertoire(
    root,
    "black",
    async () => ({ moves: [], white: 0, black: 0, draws: 0 }),
    new AbortController().signal,
  );
  assert.deepEqual(lines, []);
});

test("cancellation stops generation", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generateRepertoire(root, "white", mockBook, controller.signal), {
    name: "AbortError",
  });
});

test("opening resolution recognizes actual positions through a transposed move order", () => {
  const games = [{ pgn: "1. Nf3 c5 2. e4 Nc6 3. d4 cxd4 4. Nxd4", eco: "B30" }] as StoredGame[];
  assert.equal(
    resolveOpening(references, games, "Sicilian Defense Old Sicilian", "B30").name,
    root.name,
  );
});

test("an opening label never substitutes an unrelated board position", () => {
  const games = [{ pgn: "1. d4 d5 2. c4 e6", eco: "D30" }] as StoredGame[];
  const result = resolveOpening(references, games, root.name, "D30");
  assert.notEqual(result.name, root.name);
  assert.equal(result.eco, "D30");
});

test("network failures surface instead of returning fabricated lines", async () => {
  await assert.rejects(
    generateRepertoire(
      root,
      "black",
      async () => {
        throw new Error("offline");
      },
      new AbortController().signal,
    ),
    /offline/,
  );
});
