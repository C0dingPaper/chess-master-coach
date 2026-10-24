import assert from "node:assert/strict";
import test from "node:test";
import { completeAttempt, createTrainingState } from "../src/lib/training/engine.ts";
import {
  attachPlayingBaseline,
  attachRatingBaseline,
  ratingDecision,
  trainingLevel,
} from "../src/lib/training/progression.ts";
import type { VerifiedPlayingRating, VerifiedPuzzleRating } from "../src/lib/training/rating.ts";
import type { TrainingCollection } from "../src/lib/training/types.ts";

const playingRating: VerifiedPlayingRating = {
  rating: 1317,
  platform: "lichess",
  username: "Bucket_Head",
  mode: "rapid",
  checkedAt: 100,
  provisional: false,
};
const puzzleRating: VerifiedPuzzleRating = { ...playingRating, mode: "puzzle", rating: 1749 };
const collection: TrainingCollection = {
  id: "original",
  accountKey: "lichess:bucket_head",
  baseRating: 1700,
  ratingSource: "Lichess puzzle rating",
  createdAt: 100,
  seed: 1,
  bands: [{ rating: 1700, count: 1 }],
  puzzles: [
    {
      id: "test",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      moves: ["e2e4", "e7e5"],
      rating: 1700,
      themes: [],
      gameUrl: "",
    },
  ],
};

function trackedCollection() {
  return attachPlayingBaseline(attachRatingBaseline(collection, puzzleRating), playingRating);
}

test("puzzle rating 1749 selects difficulty while rapid 1317 sets the exact 1517 threshold", () => {
  const state = createTrainingState(trackedCollection());
  assert.equal(state.collection.baseRating, 1700);
  assert.equal(state.collection.ratingBaseline?.rating, 1749);
  assert.equal(state.collection.playingBaseline?.rating, 1317);
  assert.equal(state.collection.playingBaseline?.mode, "rapid");
  for (const current of [1200, 1317, 1400, 1450, 1516])
    assert.equal(ratingDecision(state, { ...playingRating, rating: current }), "keep");
  assert.equal(ratingDecision(state, { ...playingRating, rating: 1517 }), "upgrade");
  assert.equal(ratingDecision(state, { ...playingRating, rating: 1600 }), "upgrade");
});

test("a 200-point puzzle gain alone never replaces a drill", () => {
  const state = createTrainingState(trackedCollection());
  state.latestRating = { ...puzzleRating, rating: 1949, checkedAt: 200 };
  state.latestPlayingRating = { ...playingRating, checkedAt: 200 };
  assert.equal(ratingDecision(state, state.latestPlayingRating), "keep");
  assert.equal(
    ratingDecision(state, state.latestRating as unknown as VerifiedPlayingRating),
    "source-mismatch",
  );
  assert.equal(state.collection.id, collection.id);
  assert.equal(state.collection.playingBaseline?.rating, 1317);
});

test("falls and later checks never move the original game-rating threshold", () => {
  const state = createTrainingState(trackedCollection());
  for (const current of [1117, 1317, 1450, 1516]) {
    state.latestPlayingRating = { ...playingRating, rating: current, checkedAt: 200 };
    assert.equal(ratingDecision(state, state.latestPlayingRating), "keep");
    assert.equal(state.collection.playingBaseline?.rating, 1317);
  }
  assert.equal(ratingDecision(state, { ...playingRating, rating: 1517 }), "upgrade");
});

test("a new drill gets a new 200-point window; crossing a training tier does not refresh it", () => {
  const next = createTrainingState(
    attachPlayingBaseline(
      { ...trackedCollection(), id: "upgrade" },
      { ...playingRating, rating: 1517 },
    ),
  );
  assert.equal(trainingLevel(1517).id, "intermediate");
  assert.equal(trainingLevel(1600).id, "advanced");
  assert.equal(ratingDecision(next, { ...playingRating, rating: 1600 }), "keep");
  assert.equal(ratingDecision(next, { ...playingRating, rating: 1716 }), "keep");
  assert.equal(ratingDecision(next, { ...playingRating, rating: 1717 }), "upgrade");
  assert.equal(next.collection.playingBaseline?.rating, 1517);
});

test("ratings from a different account, platform, or time control cannot trigger progression", () => {
  const state = createTrainingState(trackedCollection());
  for (const other of [
    { ...playingRating, mode: "blitz" as const, rating: 1700 },
    { ...playingRating, platform: "chess.com" as const, rating: 1700 },
    { ...playingRating, username: "someone_else", rating: 1700 },
    { ...playingRating, provisional: true, rating: 1700 },
    puzzleRating,
  ]) {
    assert.equal(
      ratingDecision(state, other as unknown as VerifiedPlayingRating),
      "source-mismatch",
    );
  }
  assert.equal(
    ratingDecision(state, { ...playingRating, username: " BUCKET_HEAD ", rating: 1517 }),
    "upgrade",
  );
  assert.throws(() =>
    attachPlayingBaseline(collection, { ...playingRating, username: "elsewhere" }),
  );
  assert.throws(() => attachPlayingBaseline(collection, { ...playingRating, provisional: true }));
  assert.throws(() =>
    attachPlayingBaseline(collection, puzzleRating as unknown as VerifiedPlayingRating),
  );
  assert.throws(() => attachRatingBaseline(collection, { ...puzzleRating, username: "elsewhere" }));
});

test("an invalid saved baseline cannot authorize a collection upgrade", () => {
  for (const invalid of [
    { ...playingRating, provisional: true },
    { ...playingRating, username: "someone_else" },
    { ...playingRating, rating: Number.NaN },
    puzzleRating as unknown as VerifiedPlayingRating,
  ]) {
    const state = createTrainingState({ ...trackedCollection(), playingBaseline: invalid });
    assert.equal(ratingDecision(state, { ...playingRating, rating: 1700 }), "source-mismatch");
  }
  assert.equal(
    ratingDecision(null, puzzleRating as unknown as VerifiedPlayingRating),
    "source-mismatch",
  );
});

test("legacy and puzzle-v2 drills start game tracking without replacing puzzles or results", () => {
  assert.equal(ratingDecision(null, playingRating), "create");
  const legacy = createTrainingState({ ...collection, ratingSource: "calibration" });
  assert.equal(ratingDecision(legacy, playingRating), "migrate");
  assert.equal(
    ratingDecision(
      { ...legacy, collection: { ...collection, ratingBaseline: puzzleRating } },
      playingRating,
    ),
    "migrate",
  );
  const old = createTrainingState({
    ...attachRatingBaseline(collection, puzzleRating),
    ratingPolicy: "puzzle-v2",
  });
  const attempted = completeAttempt(
    { ...old, active: { ...old.active, failed: true, completed: true } },
    500,
  ).state;
  attempted.latestRating = { ...puzzleRating, rating: 1949, checkedAt: 500 };
  const before = structuredClone(attempted);
  assert.equal(ratingDecision(attempted, playingRating), "migrate");
  const migrated = {
    ...attempted,
    collection: attachPlayingBaseline(attempted.collection, playingRating),
  };
  assert.equal(migrated.collection.ratingPolicy, "playing-v3");
  assert.equal(migrated.collection.id, old.collection.id);
  assert.strictEqual(migrated.collection.puzzles, old.collection.puzzles);
  assert.deepEqual(migrated.collection.ratingBaseline, puzzleRating);
  assert.deepEqual(migrated.stats, before.stats);
  assert.deepEqual(migrated.history, before.history);
  assert.equal(migrated.attemptCount, 1);
  assert.equal(migrated.failedCount, 1);
  assert.deepEqual(migrated.active, before.active);
  assert.deepEqual(migrated.completedIds, before.completedIds);
  assert.deepEqual(attempted, before);
  assert.equal(ratingDecision(migrated, playingRating), "keep");
  assert.equal(ratingDecision(migrated, { ...playingRating, rating: 1517 }), "upgrade");
});

test("both baselines snapshot exact values without retaining mutable profile references", () => {
  const playing = { ...playingRating };
  const puzzle = { ...puzzleRating };
  const next = attachPlayingBaseline(attachRatingBaseline(collection, puzzle), playing);
  playing.rating = 2000;
  playing.mode = "blitz";
  puzzle.rating = 2500;
  assert.equal(next.playingBaseline?.rating, 1317);
  assert.equal(next.playingBaseline?.mode, "rapid");
  assert.equal(next.ratingBaseline?.rating, 1749);
  assert.equal(collection.playingBaseline, undefined);
  assert.equal(collection.ratingBaseline, undefined);
});

test("training tiers cover every supported level with clear boundary values", () => {
  const cases: [number, string][] = [
    [100, "Foundations"],
    [799, "Foundations"],
    [800, "Developing"],
    [1199, "Developing"],
    [1200, "Intermediate"],
    [1599, "Intermediate"],
    [1600, "Advanced"],
    [1999, "Advanced"],
    [2000, "Expert"],
    [2399, "Expert"],
    [2400, "Elite"],
    [3500, "Elite"],
  ];
  for (const [value, label] of cases) assert.equal(trainingLevel(value).label, label);
  assert.throws(() => trainingLevel(Number.NaN));
});
