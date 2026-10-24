import type { VerifiedPlayingRating, VerifiedPuzzleRating } from "./rating.ts";
import type { TrainingCollection, TrainingState } from "./types.ts";

export const TRAINING_GAIN = 200;

export interface TrainingLevel {
  id: string;
  label: string;
  min: number;
  max?: number;
}

// These describe this app's training tiers, not official chess titles.
const levels: readonly TrainingLevel[] = [
  { id: "foundations", label: "Foundations", min: 0, max: 799 },
  { id: "developing", label: "Developing", min: 800, max: 1199 },
  { id: "intermediate", label: "Intermediate", min: 1200, max: 1599 },
  { id: "advanced", label: "Advanced", min: 1600, max: 1999 },
  { id: "expert", label: "Expert", min: 2000, max: 2399 },
  { id: "elite", label: "Elite", min: 2400 },
];

export function trainingLevel(rating: number): TrainingLevel {
  if (!Number.isFinite(rating) || rating < 0) throw new Error("A valid rating is required.");
  return levels.find((level) => level.max === undefined || rating < level.max + 1)!;
}

function ratingAccount(rating: VerifiedPuzzleRating | VerifiedPlayingRating): string {
  return `${rating.platform}:${rating.username.trim().toLowerCase()}`;
}

export type RatingDecision = "create" | "migrate" | "keep" | "upgrade" | "source-mismatch";

function isPlayingRating(rating: VerifiedPlayingRating): boolean {
  return (
    rating.platform === "lichess" &&
    ["rapid", "blitz", "bullet", "classical"].includes(rating.mode) &&
    !rating.provisional &&
    Number.isSafeInteger(rating.rating) &&
    rating.rating >= 100 &&
    rating.rating <= 5000
  );
}

/** Compare the same game rating against its original baseline, never a puzzle rating. */
export function ratingDecision(
  state: TrainingState | null,
  rating: VerifiedPlayingRating,
): RatingDecision {
  if (!isPlayingRating(rating)) return "source-mismatch";
  if (!state) return "create";
  const collection = state.collection;
  if (collection.accountKey.toLowerCase() !== ratingAccount(rating)) return "source-mismatch";
  const baseline = collection.playingBaseline;
  if (collection.ratingPolicy !== "playing-v3" || !baseline) return "migrate";
  if (
    !isPlayingRating(baseline) ||
    ratingAccount(baseline) !== ratingAccount(rating) ||
    baseline.mode !== rating.mode
  )
    return "source-mismatch";
  return rating.rating >= baseline.rating + TRAINING_GAIN ? "upgrade" : "keep";
}

export function attachRatingBaseline(
  collection: TrainingCollection,
  rating: VerifiedPuzzleRating,
): TrainingCollection {
  if (collection.accountKey.toLowerCase() !== ratingAccount(rating))
    throw new Error("The rating does not belong to this training account.");
  return { ...collection, ratingBaseline: { ...rating } };
}

/** Start game-rating tracking without changing the current drill or puzzle difficulty. */
export function attachPlayingBaseline(
  collection: TrainingCollection,
  rating: VerifiedPlayingRating,
): TrainingCollection {
  if (!isPlayingRating(rating) || collection.accountKey.toLowerCase() !== ratingAccount(rating))
    throw new Error("The game rating does not belong to this training account.");
  return { ...collection, ratingPolicy: "playing-v3", playingBaseline: { ...rating } };
}
