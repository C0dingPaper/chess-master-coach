import { trainingDay } from "./engine.ts";

export const MAX_CREDITABLE_GAP_MS = 5000;
export interface ClockSample {
  monotonicMs: number;
  wallMs: number;
}

/** Credit only uninterrupted visible time, splitting the user's local midnight. */
export function elapsedTrainingTime(
  previous: ClockSample,
  next: ClockSample,
  wasVisible: boolean,
): { day: string; deltaMs: number }[] {
  const elapsed = next.monotonicMs - previous.monotonicMs;
  const wallElapsed = next.wallMs - previous.wallMs;
  if (
    !wasVisible ||
    !Number.isFinite(elapsed) ||
    !Number.isFinite(wallElapsed) ||
    elapsed <= 0 ||
    elapsed >= MAX_CREDITABLE_GAP_MS ||
    wallElapsed < 0 ||
    wallElapsed >= MAX_CREDITABLE_GAP_MS
  )
    return [];
  const day = trainingDay(next.wallMs);
  const previousDay = trainingDay(previous.wallMs);
  if (day === previousDay) return [{ day, deltaMs: elapsed }];
  const midnight = new Date(next.wallMs);
  midnight.setHours(0, 0, 0, 0);
  const after = Math.min(elapsed, Math.max(0, next.wallMs - midnight.getTime()));
  return [
    { day: previousDay, deltaMs: elapsed - after },
    { day, deltaMs: after },
  ].filter((slice) => slice.deltaMs > 0);
}
