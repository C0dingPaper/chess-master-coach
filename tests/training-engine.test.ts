import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  completeAttempt,
  createActivePuzzle,
  createCollection,
  createTrainingState,
  getCurrentPuzzle,
  playPuzzleMove,
  prepareTrainingSession,
  puzzleBoard,
  revealPuzzleMove,
  trainingDay,
} from "../src/lib/training/engine.ts";
import type { Puzzle, TrainingState } from "../src/lib/training/types.ts";

const NOW = new Date(2026, 9, 24, 12).getTime();
const basePuzzle: Puzzle = {
  id: "example",
  fen: new Chess().fen(),
  moves: ["e2e4", "e7e5", "g1f3", "b8c6"],
  rating: 1500,
  themes: ["opening"],
  gameUrl: "https://lichess.org/example",
};
const candidates = [1500, 1600, 1700].flatMap((rating) =>
  Array.from({ length: 600 }, (_, index) => ({
    ...basePuzzle,
    id: `${rating}-${index}`,
    rating: rating + (index % 99) - 49,
  })),
);
function initial(size = 1000) {
  const collection = createCollection("lichess:test", 1500, candidates, "lichess", {
    now: NOW,
    seed: 42,
  });
  return createTrainingState({ ...collection, puzzles: collection.puzzles.slice(0, size) }, NOW);
}
function finish(state: TrainingState, correct = true, now = NOW) {
  return completeAttempt(
    { ...state, active: { ...state.active, completed: true, failed: !correct } },
    now,
  );
}

test("personal collection contains exactly 1000 unique puzzles with the 500/300/200 split", () => {
  const collection = createCollection(
    "lichess:test",
    1500,
    [...candidates, ...candidates],
    "lichess",
    { now: NOW, seed: 10 },
  );
  assert.equal(collection.puzzles.length, 1000);
  assert.equal(new Set(collection.puzzles.map((puzzle) => puzzle.id)).size, 1000);
  assert.deepEqual(collection.bands, [
    { rating: 1500, count: 500 },
    { rating: 1600, count: 300 },
    { rating: 1700, count: 200 },
  ]);
  assert.deepEqual(
    [1500, 1600, 1700].map(
      (rating) =>
        collection.puzzles.filter((puzzle) => Math.round(puzzle.rating / 100) * 100 === rating)
          .length,
    ),
    [500, 300, 200],
  );
  assert.deepEqual(
    collection,
    createCollection("lichess:test", 1500, candidates, "lichess", { now: NOW, seed: 10 }),
  );
  assert.ok(
    new Set(collection.puzzles.slice(0, 20).map((puzzle) => Math.round(puzzle.rating / 100))).size >
      1,
  );
});

test("rating bounds clamp to complete bands and insufficient catalogs fail explicitly", () => {
  assert.equal(createCollection("x", 4000, candidates).baseRating, 1500);
  assert.equal(createCollection("x", 300, candidates).baseRating, 1500);
  assert.throws(() => createCollection("x", 1500, candidates.slice(0, 999)), /not contain enough/);
});

test("opponent setup is applied and the complete multi-move line is required", () => {
  let active = createActivePuzzle(basePuzzle);
  assert.equal(puzzleBoard(basePuzzle, active).turn(), "b");
  assert.equal(puzzleBoard(basePuzzle, active).get("e4")?.type, "p");
  let result = playPuzzleMove(basePuzzle, active, "e7e5");
  assert.equal(result.status, "correct");
  active = result.active;
  assert.equal(active.moveIndex, 3);
  assert.equal(puzzleBoard(basePuzzle, active).get("f3")?.type, "n");
  assert.equal(active.completed, false);
  result = playPuzzleMove(basePuzzle, active, "b8c6");
  assert.equal(result.status, "complete");
  assert.equal(result.active.completed, true);
  assert.equal(result.active.failed, false);
});

test("illegal moves do not score, legal mistakes persist and leave the board unchanged", () => {
  const active = createActivePuzzle(basePuzzle);
  const illegal = playPuzzleMove(basePuzzle, active, "e7e4");
  assert.equal(illegal.status, "invalid");
  assert.equal(illegal.active.failed, false);
  const wrong = playPuzzleMove(basePuzzle, active, "e7e6");
  assert.equal(wrong.status, "wrong");
  assert.equal(wrong.active.failed, true);
  assert.equal(puzzleBoard(basePuzzle, wrong.active).fen(), puzzleBoard(basePuzzle, active).fen());
  const correct = playPuzzleMove(basePuzzle, JSON.parse(JSON.stringify(wrong.active)), "e7e5");
  assert.equal(correct.active.failed, true);
});

test("revealing a move marks the eventual result incorrect, including after a reload", () => {
  let state = initial();
  const puzzle = getCurrentPuzzle(state);
  let active = revealPuzzleMove(puzzle, state.active).active;
  assert.equal(active.hinted, true);
  active = playPuzzleMove(puzzle, JSON.parse(JSON.stringify(active)), "b8c6").active;
  state = { ...state, active };
  const result = completeAttempt(state, NOW);
  assert.equal(result.attempt.correct, false);
  assert.equal(result.attempt.hinted, true);
  assert.equal(result.state.stats[puzzle.id].firstTryCorrect, false);
  assert.equal(result.state.failedCount, 1);
  assert.throws(() => completeAttempt(result.state, NOW), /entire solution/);
});

test("accepts alternative checkmate and preserves its actual position", () => {
  const puzzle: Puzzle = {
    ...basePuzzle,
    fen: "7k/8/6K1/8/Q7/8/8/8 b - - 0 1",
    moves: ["h8g8", "a4a8"],
  };
  const result = playPuzzleMove(puzzle, createActivePuzzle(puzzle), "a4e8");
  assert.equal(result.status, "complete");
  assert.equal(result.active.failed, false);
  assert.equal(result.active.alternateMate, "a4e8");
  assert.equal(puzzleBoard(puzzle, result.active).isCheckmate(), true);
  assert.equal(puzzleBoard(puzzle, result.active).get("e8")?.type, "q");
});

test("supports explicit underpromotion UCI", () => {
  const puzzle: Puzzle = {
    ...basePuzzle,
    fen: "7k/P7/8/8/8/8/8/7K b - - 0 1",
    moves: ["h8g8", "a7a8n"],
  };
  const result = playPuzzleMove(puzzle, createActivePuzzle(puzzle), "a7a8n");
  assert.equal(result.status, "complete");
  assert.equal(puzzleBoard(puzzle, result.active).get("a8")?.type, "n");
});

test("a failed puzzle returns after three intervening attempts and repeat results do not inflate unique progress", () => {
  let state = initial(20);
  const failedId = state.active.puzzleId;
  state = finish(state, false).state;
  for (let index = 0; index < 3; index++) {
    assert.notEqual(state.active.puzzleId, failedId);
    state = finish(state).state;
  }
  assert.equal(state.active.puzzleId, failedId);
  assert.equal(state.active.kind, "review");
  const unique = state.completedIds.length;
  const result = finish(state);
  state = result.state;
  assert.equal(result.attempt.firstAttempt, false);
  assert.equal(state.completedIds.length, unique);
  assert.equal(state.stats[failedId].firstTryCorrect, false);
  assert.equal(state.stats[failedId].successStreak, 1);
  assert.equal(state.stats[failedId].dueAttempt, 11);
  assert.equal(state.active.kind, "new");
});

test("mistake reviews do not starve the base collection or repeat immediately at cycle boundaries", () => {
  let state = initial(30);
  const baseIds = new Set<string>();
  let previous = "";
  let attempts = 0;
  while (state.cycle === 1 && attempts < 100) {
    assert.notEqual(state.active.puzzleId, previous);
    if (state.active.kind === "new") baseIds.add(state.active.puzzleId);
    previous = state.active.puzzleId;
    state = finish(state, false).state;
    attempts++;
  }
  assert.equal(baseIds.size, 30);
  assert.equal(state.cycle, 2);
  assert.ok(attempts <= 60);
  assert.notEqual(state.active.puzzleId, previous);
  assert.equal(state.completedIds.length, 30);
});

test("a full clean cycle reshuffles the fixed collection and records cycle performance", () => {
  let state = initial();
  const initialOrder = state.order;
  let lastId = "";
  for (let index = 0; index < 1000; index++) {
    lastId = state.active.puzzleId;
    state = finish(state).state;
  }
  assert.equal(state.cycle, 2);
  assert.equal(state.completedIds.length, 1000);
  assert.deepEqual([...state.order].sort(), [...initialOrder].sort());
  assert.notDeepEqual(state.order, initialOrder);
  assert.notEqual(state.active.puzzleId, lastId);
  assert.deepEqual(state.history, [{ cycle: 1, completedAt: NOW, attempts: 1000, correct: 1000 }]);
});

test("next-day reviews preserve the pending base puzzle and unfinished solutions", () => {
  let state = initial(30);
  const failedId = state.active.puzzleId;
  state = finish(state, false).state;
  for (let index = 0; index < 4; index++) state = finish(state).state;
  assert.equal(state.stats[failedId].successStreak, 1);
  for (let index = 0; index < 3; index++) state = finish(state).state;
  const cursor = state.cursor;
  const pendingId = state.active.puzzleId;
  const tomorrow = new Date(2026, 9, 25, 12).getTime();
  const resumed = prepareTrainingSession(state, tomorrow);
  assert.equal(resumed.active.puzzleId, failedId);
  assert.equal(resumed.active.kind, "review");
  assert.equal(resumed.cursor, cursor - 1);
  assert.equal(resumed.order[resumed.cursor], pendingId);
  const afterReview = finish(resumed, true, tomorrow).state;
  assert.equal(afterReview.active.puzzleId, pendingId);
  assert.equal(afterReview.stats[failedId].successStreak, 2);
  assert.equal(afterReview.stats[failedId].dueAttempt, afterReview.attemptCount + 12);
  assert.equal(afterReview.stats[failedId].dueDay, "2026-10-28");
  assert.equal(
    prepareTrainingSession({ ...state, active: { ...state.active, moveIndex: 3 } }, tomorrow).active
      .puzzleId,
    pendingId,
  );
});

test("day keys use local calendar dates", () => {
  assert.equal(trainingDay(new Date(2026, 0, 2, 0, 1).getTime()), "2026-01-02");
});
