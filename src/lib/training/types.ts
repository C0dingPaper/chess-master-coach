import type { VerifiedPlayingRating, VerifiedPuzzleRating } from "./rating.ts";

export interface Puzzle {
  id: string;
  /** Lichess position BEFORE moves[0], the opponent's setup move. */
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  gameUrl: string;
}

export interface TrainingCollection {
  id: string;
  accountKey: string;
  baseRating: number;
  ratingSource: string;
  /** Puzzle rating used to choose difficulty; never triggers collection replacement. */
  ratingBaseline?: VerifiedPuzzleRating;
  /** Exact game rating at the start of this drill's 200-point improvement window. */
  playingBaseline?: VerifiedPlayingRating;
  /** Old puzzle-based policies migrate without replacing the collection. */
  ratingPolicy?: "puzzle-v2" | "playing-v3";
  createdAt: number;
  seed: number;
  bands: { rating: number; count: number }[];
  puzzles: Puzzle[];
}

export interface PuzzleStats {
  attempts: number;
  failures: number;
  firstTryCorrect: boolean;
  successStreak: number;
  lastAttempt: number;
  lastAttemptAt: number;
  dueAttempt: number | null;
  dueDay: string | null;
}

export interface ActivePuzzle {
  puzzleId: string;
  kind: "new" | "review";
  /** Number of raw solution plies played, including the setup move. */
  moveIndex: number;
  failed: boolean;
  hinted: boolean;
  completed: boolean;
  alternateMate?: string;
  lastMove?: [string, string];
}

export interface CycleSummary {
  cycle: number;
  completedAt: number;
  attempts: number;
  correct: number;
}

export interface TrainingState {
  version: 1;
  collection: TrainingCollection;
  /** Latest puzzle rating, used only to select puzzle difficulty. */
  latestRating?: VerifiedPuzzleRating;
  /** Latest game rating; does not move the collection's original gain threshold. */
  latestPlayingRating?: VerifiedPlayingRating;
  cycle: number;
  order: string[];
  /** Index of the next base puzzle; review attempts do not consume this. */
  cursor: number;
  active: ActivePuzzle;
  stats: Record<string, PuzzleStats>;
  attemptCount: number;
  correctCount: number;
  failedCount: number;
  completedIds: string[];
  history: CycleSummary[];
  cycleStartedAttempt: number;
  cycleStartedCorrect: number;
  updatedAt: number;
}

export interface TrainingAttempt {
  id: string;
  accountKey: string;
  collectionId: string;
  puzzleId: string;
  cycle: number;
  sequence: number;
  at: number;
  day: string;
  correct: boolean;
  firstAttempt: boolean;
  kind: "new" | "review";
  hinted: boolean;
}

export interface DailyTraining {
  id: string;
  accountKey: string;
  day: string;
  activeMs: number;
  /** Incremented when the user resets today's timer; missing means zero. */
  timerVersion?: number;
  attempts: number;
  correct: number;
  failed: number;
  firstAttempts: number;
  firstCorrect: number;
}
