import assert from "node:assert/strict";
import test from "node:test";
import { elapsedTrainingTime } from "../src/lib/training/clock.ts";
import { DAILY_GOAL_MS } from "../src/lib/training/engine.ts";

test("the daily training goal is exactly one hour", () => {
  assert.equal(DAILY_GOAL_MS, 3600000);
});

const start = new Date(2026, 9, 24, 14, 0, 0).getTime();
const before = { monotonicMs: 10000, wallMs: start };

test("credits visible practice using monotonic elapsed time", () => {
  assert.deepEqual(
    elapsedTrainingTime(before, { monotonicMs: 11000, wallMs: start + 1010 }, true),
    [{ day: "2026-10-24", deltaMs: 1000 }],
  );
});
test("never credits hidden time", () => {
  assert.deepEqual(
    elapsedTrainingTime(before, { monotonicMs: 11000, wallMs: start + 1000 }, false),
    [],
  );
});
test("does not count sleeping or suspended tabs on either clock", () => {
  assert.deepEqual(
    elapsedTrainingTime(before, { monotonicMs: 16000, wallMs: start + 6000 }, true),
    [],
  );
  assert.deepEqual(
    elapsedTrainingTime(before, { monotonicMs: 11000, wallMs: start + 3600000 }, true),
    [],
  );
  assert.deepEqual(
    elapsedTrainingTime(before, { monotonicMs: 10000, wallMs: start + 1000 }, true),
    [],
  );
  assert.deepEqual(
    elapsedTrainingTime(before, { monotonicMs: 11000, wallMs: start - 1000 }, true),
    [],
  );
});
test("splits training across local midnight without double counting", () => {
  const midnight = new Date(2026, 9, 25, 0, 0, 0).getTime();
  assert.deepEqual(
    elapsedTrainingTime(
      { monotonicMs: 0, wallMs: midnight - 700 },
      { monotonicMs: 1000, wallMs: midnight + 300 },
      true,
    ),
    [
      { day: "2026-10-24", deltaMs: 700 },
      { day: "2026-10-25", deltaMs: 300 },
    ],
  );
});
test("handles year boundaries and exact midnight", () => {
  const midnight = new Date(2027, 0, 1, 0, 0, 0).getTime();
  assert.deepEqual(
    elapsedTrainingTime(
      { monotonicMs: 0, wallMs: midnight - 1000 },
      { monotonicMs: 1000, wallMs: midnight },
      true,
    ),
    [{ day: "2026-12-31", deltaMs: 1000 }],
  );
});
