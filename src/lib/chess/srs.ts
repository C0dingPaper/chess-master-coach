import type { PinnedPosition } from "./types";

export type Quality = "again" | "hard" | "good" | "easy";

const DAY_MS = 24 * 60 * 60 * 1000;

/** SM-2 inspired update. */
export function schedule(card: PinnedPosition, q: Quality): PinnedPosition {
  let { ease, interval, reps } = card;
  if (q === "again") {
    reps = 0;
    interval = 0;     // re-show within minutes
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.round(interval * ease);
    if (q === "hard") { ease = Math.max(1.3, ease - 0.15); interval = Math.max(1, Math.round(interval * 0.8)); }
    else if (q === "easy") { ease = ease + 0.15; interval = Math.round(interval * 1.3); }
  }
  const now = Date.now();
  const due = q === "again" ? now + 2 * 60 * 1000 : now + interval * DAY_MS;
  return { ...card, ease, interval, reps, due, lastReviewed: now };
}

export function isDue(card: PinnedPosition): boolean {
  return card.due <= Date.now();
}

export function newCard(seed: Pick<PinnedPosition, "fen" | "myMove" | "label" | "note" | "lineId">): PinnedPosition {
  return {
    id: `pin_${Math.random().toString(36).slice(2, 10)}`,
    ...seed,
    createdAt: Date.now(),
    ease: 2.5,
    interval: 0,
    reps: 0,
    due: Date.now(),
    lastReviewed: null,
  };
}
