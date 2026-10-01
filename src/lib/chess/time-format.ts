import type { Platform, StoredGame } from "./types";

/** Category labels also work for games already saved before this formatter existed. */
export function timeFormatLabel(game: Pick<StoredGame, "platform" | "timeControl">): string {
  return classifyTimeControl(game.timeControl, game.platform);
}

export function classifyTimeControl(timeControl: string, platform: Platform): string {
  const control = timeControl.trim();
  if (/^\d+\/\d+$/.test(control)) return platform === "chess.com" ? "Daily" : "Correspondence";
  if (control === "-") return "Unlimited";
  const match = /^(\d+)(?:\+(\d+))?$/.exec(control);
  if (!match) return "Unknown";
  const seconds = Number(match[1]) + 40 * Number(match[2] ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "Unknown";
  if (platform === "lichess") {
    if (seconds < 30) return "UltraBullet";
    if (seconds < 180) return "Bullet";
    if (seconds < 480) return "Blitz";
    if (seconds < 1500) return "Rapid";
    return "Classical";
  }
  if (seconds < 180) return "Bullet";
  if (seconds < 600) return "Blitz";
  // Match the Classical option in the account import dialog.
  return seconds < 1800 ? "Rapid" : "Classical";
}
