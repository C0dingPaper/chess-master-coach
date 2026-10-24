import type { Connection } from "../chess/types";

export interface VerifiedPuzzleRating {
  rating: number;
  platform: "lichess";
  username: string;
  mode: "puzzle";
  checkedAt: number;
  provisional: boolean;
}

export type PlayingRatingMode = "rapid" | "blitz" | "bullet" | "classical";

export interface VerifiedPlayingRating extends Omit<VerifiedPuzzleRating, "mode"> {
  mode: PlayingRatingMode;
}

export interface TrainingRatings {
  puzzle: VerifiedPuzzleRating | null;
  playing: VerifiedPlayingRating | null;
}

export interface ConnectedPuzzleRating {
  rating: number;
  source: "lichess";
  label: string;
}

export const INITIAL_CALIBRATION_RATING = 1500;
export const CALIBRATION_LENGTH = 5;
const calibrationSteps = [300, 200, 100, 100, 100] as const;
const minimumRatedPuzzles = 20;
const profileTimeoutMs = 8000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function establishedRating(performance: unknown, minimumGames: number): number | null {
  if (
    !record(performance) ||
    (performance.prov !== undefined && performance.prov !== false) ||
    typeof performance.games !== "number" ||
    !Number.isSafeInteger(performance.games) ||
    performance.games < minimumGames ||
    typeof performance.rating !== "number" ||
    !Number.isSafeInteger(performance.rating) ||
    performance.rating < 100 ||
    performance.rating > 5000
  ) {
    return null;
  }
  return performance.rating;
}

/** A short placement estimate, not an official or updated platform rating. */
export function updateCalibrationRating(
  currentRating: number,
  correct: boolean,
  completedBefore: number,
): number {
  const rating = Number.isFinite(currentRating) ? currentRating : INITIAL_CALIBRATION_RATING;
  const step = Number.isInteger(completedBefore) ? calibrationSteps[completedBefore] : undefined;
  if (step === undefined) return rating;
  return Math.min(3000, Math.max(500, Math.round((rating + (correct ? step : -step)) / 100) * 100));
}

/**
 * Lichess public profile API: https://lichess.org/api#tag/Users/operation/apiUser
 * Read both ratings from one fresh profile. Puzzle difficulty and improvement in
 * rated games are separate scales; missing data must not substitute one for the
 * other or silently change the chosen game time control.
 */
export async function fetchTrainingRatings(
  connection: Connection,
  signal?: AbortSignal,
  mode: PlayingRatingMode = "rapid",
): Promise<TrainingRatings> {
  const unavailable: TrainingRatings = { puzzle: null, playing: null };
  if (connection.platform !== "lichess" || !connection.username.trim() || signal?.aborted) {
    return unavailable;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, profileTimeoutMs);
  try {
    const response = await fetch(
      `https://lichess.org/api/user/${encodeURIComponent(connection.username.trim())}?profile=false`,
      { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!response.ok) return unavailable;
    const data: unknown = await response.json();
    if (controller.signal.aborted || !record(data) || !record(data.perfs)) {
      return unavailable;
    }
    const puzzle = establishedRating(data.perfs.puzzle, minimumRatedPuzzles);
    const playing = establishedRating(data.perfs[mode], 1);
    const snapshot = {
      platform: "lichess" as const,
      username: connection.username.trim(),
      checkedAt: Date.now(),
      provisional: false,
    };
    return {
      puzzle: puzzle === null ? null : { ...snapshot, rating: puzzle, mode: "puzzle" },
      playing: playing === null ? null : { ...snapshot, rating: playing, mode },
    };
  } catch {
    // Keep existing training progress when the profile cannot be verified.
    return unavailable;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchVerifiedPuzzleRating(
  connection: Connection,
  signal?: AbortSignal,
): Promise<VerifiedPuzzleRating | null> {
  return (await fetchTrainingRatings(connection, signal)).puzzle;
}

export async function fetchConnectedPuzzleRating(
  connection: Connection,
  signal?: AbortSignal,
): Promise<ConnectedPuzzleRating | null> {
  const verified = await fetchVerifiedPuzzleRating(connection, signal);
  return verified
    ? { rating: verified.rating, source: "lichess", label: "Lichess puzzle rating" }
    : null;
}
