import { Chess } from "chess.js";
import type {
  ActivePuzzle,
  Puzzle,
  TrainingAttempt,
  TrainingCollection,
  TrainingState,
} from "./types.ts";

export const DAILY_GOAL_MS = 60 * 60 * 1000;
export const COLLECTION_SIZE = 1000;

/** Use the user's local day, consistently for the timer and review schedule. */
export function trainingDay(now = Date.now()): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function futureDay(now: number, days: number) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return trainingDay(date.getTime());
}

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let random = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const other = Math.floor((random / 4294967296) * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createCollection(
  accountKey: string,
  baseRating: number,
  puzzles: Puzzle[],
  ratingSource = "puzzle",
  options: { now?: number; seed?: number } = {},
): TrainingCollection {
  if (!accountKey || !Number.isFinite(baseRating))
    throw new Error("A valid account and rating are required.");
  const now = options.now ?? Date.now();
  const seed = options.seed ?? hash(`${accountKey}:${now}`);
  const unique = [...new Map(puzzles.map((puzzle) => [puzzle.id, puzzle])).values()];
  const buckets = new Map<number, Puzzle[]>();
  for (const puzzle of unique) {
    if (!Number.isFinite(puzzle.rating) || puzzle.moves.length < 2) continue;
    const bucket = Math.round(puzzle.rating / 100) * 100;
    const entries = buckets.get(bucket) ?? [];
    entries.push(puzzle);
    buckets.set(bucket, entries);
  }
  // Only complete, adjacent bands can form a collection. Never silently reuse puzzles.
  const validBases = [...buckets.keys()].filter(
    (rating) =>
      (buckets.get(rating)?.length ?? 0) >= 500 &&
      (buckets.get(rating + 100)?.length ?? 0) >= 300 &&
      (buckets.get(rating + 200)?.length ?? 0) >= 200,
  );
  if (!validBases.length)
    throw new Error(
      "The puzzle catalog does not contain enough puzzles for all three rating bands.",
    );
  const target = Math.round(baseRating / 100) * 100;
  const normalizedBase = validBases.sort(
    (a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b,
  )[0];
  const bands = [500, 300, 200].map((count, index) => ({
    rating: normalizedBase + index * 100,
    count,
  }));
  const selected = bands.flatMap(({ rating, count }, index) =>
    shuffled(
      buckets.get(rating)!.sort((a, b) => a.id.localeCompare(b.id)),
      seed + index,
    ).slice(0, count),
  );
  return {
    id: `${accountKey}:${now}:${seed}`,
    accountKey,
    baseRating: normalizedBase,
    ratingSource,
    createdAt: now,
    seed,
    bands,
    puzzles: shuffled(selected, seed ^ 0x9e3779b9),
  };
}

export function createActivePuzzle(
  puzzle: Puzzle,
  kind: ActivePuzzle["kind"] = "new",
): ActivePuzzle {
  return {
    puzzleId: puzzle.id,
    kind,
    moveIndex: 1,
    failed: false,
    hinted: false,
    completed: false,
    lastMove: [puzzle.moves[0].slice(0, 2), puzzle.moves[0].slice(2, 4)],
  };
}

export function createTrainingState(
  collection: TrainingCollection,
  now = Date.now(),
): TrainingState {
  if (!collection.puzzles.length) throw new Error("A training collection cannot be empty.");
  const order = shuffled(
    collection.puzzles.map((puzzle) => puzzle.id),
    collection.seed,
  );
  const puzzle = collection.puzzles.find((entry) => entry.id === order[0])!;
  return {
    version: 1,
    collection,
    cycle: 1,
    order,
    cursor: 1,
    active: createActivePuzzle(puzzle),
    stats: {},
    attemptCount: 0,
    correctCount: 0,
    failedCount: 0,
    completedIds: [],
    history: [],
    cycleStartedAttempt: 0,
    cycleStartedCorrect: 0,
    updatedAt: now,
  };
}

export function getCurrentPuzzle(state: TrainingState): Puzzle {
  const puzzle = state.collection.puzzles.find((entry) => entry.id === state.active.puzzleId);
  if (!puzzle) throw new Error("The current puzzle is missing from this collection.");
  return puzzle;
}

function moveUci(board: Chess, uci: string) {
  return board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/** Rebuild from saved plies so the complete position survives reloads. */
export function puzzleBoard(puzzle: Puzzle, active: ActivePuzzle): Chess {
  const board = new Chess(puzzle.fen);
  const end = Math.min(active.moveIndex, puzzle.moves.length);
  for (let index = 0; index < end; index++) {
    moveUci(
      board,
      active.alternateMate && index === end - 1 ? active.alternateMate : puzzle.moves[index],
    );
  }
  return board;
}

export function getActiveBoard(state: TrainingState) {
  return puzzleBoard(getCurrentPuzzle(state), state.active);
}

export type MoveStatus = "invalid" | "wrong" | "correct" | "complete";

export function playPuzzleMove(
  puzzle: Puzzle,
  active: ActivePuzzle,
  uci: string,
): { active: ActivePuzzle; status: MoveStatus } {
  if (
    active.completed ||
    active.puzzleId !== puzzle.id ||
    !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
  ) {
    return { active, status: "invalid" };
  }
  const board = puzzleBoard(puzzle, active);
  try {
    moveUci(board, uci);
  } catch {
    return { active, status: "invalid" };
  }
  const expected = puzzle.moves[active.moveIndex];
  if (uci !== expected && !board.isCheckmate()) {
    return { active: { ...active, failed: true }, status: "wrong" };
  }
  let moveIndex = active.moveIndex + 1;
  let lastMove: [string, string] = [uci.slice(0, 2), uci.slice(2, 4)];
  // A different mating move ends the puzzle even if the source line is longer.
  const alternateMate = uci !== expected ? uci : undefined;
  if (!board.isCheckmate() && moveIndex < puzzle.moves.length) {
    const reply = puzzle.moves[moveIndex++];
    moveUci(board, reply);
    lastMove = [reply.slice(0, 2), reply.slice(2, 4)];
  }
  const completed = board.isCheckmate() || moveIndex >= puzzle.moves.length;
  return {
    active: { ...active, moveIndex, lastMove, completed, alternateMate },
    status: completed ? "complete" : "correct",
  };
}

export function revealPuzzleMove(puzzle: Puzzle, active: ActivePuzzle) {
  return playPuzzleMove(
    puzzle,
    { ...active, failed: true, hinted: true },
    puzzle.moves[active.moveIndex] ?? "",
  );
}

export function submitMove(
  state: TrainingState,
  uci: string,
): { state: TrainingState; status: MoveStatus } {
  const result = playPuzzleMove(getCurrentPuzzle(state), state.active, uci);
  return { state: { ...state, active: result.active }, status: result.status };
}

export function revealMove(state: TrainingState): { state: TrainingState; status: MoveStatus } {
  const result = revealPuzzleMove(getCurrentPuzzle(state), state.active);
  return { state: { ...state, active: result.active }, status: result.status };
}

export function markHint(state: TrainingState): TrainingState {
  return { ...state, active: { ...state.active, failed: true, hinted: true } };
}

export function dueReviewCount(state: TrainingState, now = Date.now()): number {
  const day = trainingDay(now);
  return Object.values(state.stats).filter(
    (stats) =>
      stats.dueAttempt !== null &&
      (stats.dueAttempt <= state.attemptCount || (stats.dueDay !== null && stats.dueDay <= day)),
  ).length;
}

/** Prefer an overdue review on return, while preserving an untouched base puzzle. */
export function prepareTrainingSession(state: TrainingState, now = Date.now()): TrainingState {
  if (
    state.active.kind !== "new" ||
    state.active.moveIndex !== 1 ||
    state.active.failed ||
    state.active.completed
  )
    return state;
  const review = Object.entries(state.stats)
    .filter(
      ([id, stats]) =>
        id !== state.active.puzzleId &&
        stats.dueDay !== null &&
        stats.dueDay <= trainingDay(now) &&
        state.attemptCount - stats.lastAttempt >= 3,
    )
    .sort((a, b) => a[1].lastAttempt - b[1].lastAttempt)[0]?.[0];
  if (!review) return state;
  return {
    ...state,
    cursor: state.cursor - 1,
    active: createActivePuzzle(
      state.collection.puzzles.find((puzzle) => puzzle.id === review)!,
      "review",
    ),
  };
}

/** Record a full solution once, then weave reviews between the shuffled base puzzles. */
export function completeAttempt(
  state: TrainingState,
  now = Date.now(),
): { state: TrainingState; attempt: TrainingAttempt } {
  if (!state.active.completed)
    throw new Error("Finish the entire solution before recording an attempt.");
  const { puzzleId, kind } = state.active;
  const previous = state.stats[puzzleId];
  const correct = !state.active.failed && !state.active.hinted;
  const sequence = state.attemptCount + 1;
  const streak = correct ? (previous?.successStreak ?? 0) + 1 : 0;
  const needsReview = !correct || (previous?.failures ?? 0) > 0;
  const spacing = correct ? [6, 12, 24, 48][Math.min(streak - 1, 3)] : 4;
  const days = correct ? [1, 3, 7, 14][Math.min(streak - 1, 3)] : 1;
  const attempt: TrainingAttempt = {
    id: `${state.collection.id}:${sequence}`,
    accountKey: state.collection.accountKey,
    collectionId: state.collection.id,
    puzzleId,
    cycle: state.cycle,
    sequence,
    at: now,
    day: trainingDay(now),
    correct,
    firstAttempt: !previous,
    kind,
    hinted: state.active.hinted,
  };
  let next: TrainingState = {
    ...state,
    attemptCount: sequence,
    correctCount: state.correctCount + Number(correct),
    failedCount: state.failedCount + Number(!correct),
    completedIds: previous ? state.completedIds : [...state.completedIds, puzzleId],
    stats: {
      ...state.stats,
      [puzzleId]: {
        attempts: (previous?.attempts ?? 0) + 1,
        failures: (previous?.failures ?? 0) + Number(!correct),
        firstTryCorrect: previous?.firstTryCorrect ?? correct,
        successStreak: streak,
        lastAttempt: sequence,
        lastAttemptAt: now,
        dueAttempt: needsReview ? sequence + spacing : null,
        dueDay: needsReview ? futureDay(now, days) : null,
      },
    },
    updatedAt: now,
  };

  if (kind === "new" && next.cursor >= next.order.length) {
    const order = shuffled(next.order, next.collection.seed + next.cycle);
    if (order[0] === puzzleId && order.length > 1) [order[0], order[1]] = [order[1], order[0]];
    next = {
      ...next,
      cycle: next.cycle + 1,
      cursor: 0,
      order,
      history: [
        ...next.history,
        {
          cycle: next.cycle,
          completedAt: now,
          attempts: sequence - next.cycleStartedAttempt,
          correct: next.correctCount - next.cycleStartedCorrect,
        },
      ],
      cycleStartedAttempt: sequence,
      cycleStartedCorrect: next.correctCount,
    };
  }

  // Never put two review attempts in a row: unseen puzzles cannot be starved.
  const review =
    kind === "review"
      ? undefined
      : Object.entries(next.stats)
          .filter(
            ([id, stats]) =>
              id !== puzzleId &&
              id !== next.order[next.cursor] &&
              stats.dueAttempt !== null &&
              sequence - stats.lastAttempt >= 3 &&
              (stats.dueAttempt <= sequence + 1 ||
                (stats.dueDay !== null && stats.dueDay <= attempt.day)),
          )
          .sort((a, b) => a[1].lastAttempt - b[1].lastAttempt)[0]?.[0];
  if (review) {
    next.active = createActivePuzzle(
      next.collection.puzzles.find((entry) => entry.id === review)!,
      "review",
    );
  } else {
    // An intervening review might match the next base entry; swap two entries to avoid an immediate repeat.
    const order = [...next.order];
    if (order[next.cursor] === puzzleId && next.cursor + 1 < order.length) {
      [order[next.cursor], order[next.cursor + 1]] = [order[next.cursor + 1], order[next.cursor]];
    }
    next.order = order;
    next.active = createActivePuzzle(
      next.collection.puzzles.find((entry) => entry.id === order[next.cursor])!,
    );
    next.cursor += 1;
  }
  return { state: next, attempt };
}
