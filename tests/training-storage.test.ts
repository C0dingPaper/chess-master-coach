import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createCollection,
  createTrainingState,
  completeAttempt,
  getCurrentPuzzle,
  playPuzzleMove,
  getActiveBoard,
} from "../src/lib/training/engine.ts";
import {
  addTrainingTime,
  getDailyTraining,
  loadTrainingState,
  saveTrainingState,
  saveAttempt,
  getTrainingAttempts,
  claimTrainingLease,
  releaseTrainingLease,
  flushTrainingWrites,
  resetTrainingTime,
  replaceTrainingCollection,
  getTrainingArchives,
} from "../src/lib/training/storage.ts";
import type { Puzzle, TrainingState } from "../src/lib/training/types.ts";

const puzzles = [1500, 1600, 1700].flatMap(
  (rating) =>
    JSON.parse(
      readFileSync(new URL(`../public/puzzles/${rating}.json`, import.meta.url), "utf8"),
    ) as Puzzle[],
);
function stateFor(account: string) {
  return createTrainingState(
    createCollection(account, 1500, puzzles, "test", { seed: 10, now: 1 }),
  );
}
function solve(state: TrainingState) {
  let active = state.active;
  const puzzle = getCurrentPuzzle(state);
  while (!active.completed)
    active = playPuzzleMove(puzzle, active, puzzle.moves[active.moveIndex]).active;
  return { ...state, active };
}

test("persists a partially solved position and mistake flag across reads", async () => {
  const state = stateFor("lichess:partial");
  const puzzle = getCurrentPuzzle(state);
  const active = { ...playPuzzleMove(puzzle, state.active, puzzle.moves[1]).active, failed: true };
  const next = { ...state, active };
  await saveTrainingState(next);
  const loaded = await loadTrainingState("lichess:partial");
  assert.deepEqual(loaded, next);
  assert.equal(getActiveBoard(loaded!).fen(), getActiveBoard(next).fen());
  assert.equal(loaded?.active.failed, true);
});

test("records an attempt and its next position atomically; duplicate retries do not inflate counts", async () => {
  const state = stateFor("lichess:atomic");
  const result = completeAttempt(solve(state));
  await Promise.all([
    saveAttempt(result.state, result.attempt),
    saveAttempt(result.state, result.attempt),
  ]);
  assert.equal((await loadTrainingState("lichess:atomic"))?.attemptCount, 1);
  const daily = await getDailyTraining("lichess:atomic", result.attempt.day);
  assert.equal(daily.attempts, 1);
  assert.equal(daily.correct, 1);
  assert.equal(daily.firstAttempts, 1);
  assert.equal((await getTrainingAttempts("lichess:atomic")).length, 1);
  await saveTrainingState(state);
  assert.equal(
    (await loadTrainingState("lichess:atomic"))?.attemptCount,
    1,
    "stale snapshots cannot undo completed attempts",
  );
});

test("serializes immediate progress writes before a resumed read", async () => {
  const state = stateFor("lichess:queued");
  void saveTrainingState(state);
  void saveTrainingState({ ...state, active: { ...state.active, failed: true } });
  await flushTrainingWrites();
  assert.equal((await loadTrainingState("lichess:queued"))?.active.failed, true);
});

test("adds simultaneous clock increments without losing attempt counters or mixing accounts and days", async () => {
  const state = stateFor("lichess:timer");
  const result = completeAttempt(solve(state));
  await Promise.all([
    addTrainingTime("lichess:timer", 500, result.attempt.day),
    saveAttempt(result.state, result.attempt),
    addTrainingTime("lichess:timer", 750, result.attempt.day),
  ]);
  const daily = await getDailyTraining("lichess:timer", result.attempt.day);
  assert.equal(daily.activeMs, 1250);
  assert.equal(daily.attempts, 1);
  assert.equal((await getDailyTraining("chess.com:timer", result.attempt.day)).activeMs, 0);
  assert.equal((await getDailyTraining("lichess:timer", "2020-01-01")).activeMs, 0);
  assert.equal(await loadTrainingState("chess.com:timer"), null);
  await assert.rejects(addTrainingTime("lichess:timer", -1));
});

test("fallback tab leases have one owner, expire, and cannot be released by another owner", async () => {
  assert.equal(await claimTrainingLease("lichess:lease", "first", 100), true);
  assert.equal(await claimTrainingLease("lichess:lease", "second", 100), false);
  await releaseTrainingLease("lichess:lease", "second");
  assert.equal(await claimTrainingLease("lichess:lease", "second", 200), false);
  assert.equal(await claimTrainingLease("lichess:lease", "second", 16000), true);
  await releaseTrainingLease("lichess:lease", "second");
  assert.equal(await claimTrainingLease("lichess:lease", "third", 16001), true);
});

test("reset clears only today's timer and rejects old ticks while allowing new ticks", async () => {
  const state = stateFor("lichess:reset-clock");
  const result = completeAttempt(solve(state));
  await saveAttempt(result.state, result.attempt);
  await addTrainingTime(state.collection.accountKey, 3600000, result.attempt.day, 0);
  await addTrainingTime(state.collection.accountKey, 1234, "2020-01-01", 0);
  const reset = await resetTrainingTime(state.collection.accountKey, result.attempt.day);
  assert.equal(reset.activeMs, 0);
  assert.equal(reset.timerVersion, 1);
  assert.equal(reset.attempts, 1);
  assert.equal(reset.correct, 1);
  const oldTick = await addTrainingTime(state.collection.accountKey, 1000, result.attempt.day, 0);
  assert.equal(oldTick.activeMs, 0);
  const newTick = await addTrainingTime(state.collection.accountKey, 500, result.attempt.day, 1);
  assert.equal(newTick.activeMs, 500);
  assert.deepEqual(await loadTrainingState(state.collection.accountKey), result.state);
  assert.equal((await getDailyTraining(state.collection.accountKey, "2020-01-01")).activeMs, 1234);
});

test("upgrading archives the entire old drill and preserves daily time and results", async () => {
  const state = stateFor("lichess:upgrade");
  const result = completeAttempt(solve(state));
  await saveAttempt(result.state, result.attempt);
  await addTrainingTime(state.collection.accountKey, 120000);
  const next = createTrainingState({ ...state.collection, id: "upgraded-drill" });
  assert.equal(await replaceTrainingCollection(next, "incorrect-old-id"), false);
  assert.equal(await replaceTrainingCollection(next, state.collection.id), true);
  assert.deepEqual(await getTrainingArchives(state.collection.accountKey), [result.state]);
  assert.deepEqual(await loadTrainingState(state.collection.accountKey), next);
  assert.equal((await getDailyTraining(state.collection.accountKey)).activeMs, 120000);
  assert.equal((await getDailyTraining(state.collection.accountKey)).attempts, 1);
  await saveTrainingState(result.state);
  await saveAttempt(result.state, result.attempt);
  assert.deepEqual(await loadTrainingState(state.collection.accountKey), next);
  assert.equal((await getDailyTraining(state.collection.accountKey)).attempts, 1);
});
