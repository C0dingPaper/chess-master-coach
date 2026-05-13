import type { StoredGame } from "./types";

export interface OverallStats {
  total: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  asWhite: { wins: number; draws: number; losses: number };
  asBlack: { wins: number; draws: number; losses: number };
  currentStreak: number;       // signed: positive=wins in a row, negative=losses
  avgAccuracy: number | null;
  rating: number | null;
  ratingDelta: number;          // last 30 days
}

export function computeStats(games: StoredGame[]): OverallStats {
  const total = games.length;
  let wins = 0, draws = 0, losses = 0;
  const aw = { wins: 0, draws: 0, losses: 0 };
  const ab = { wins: 0, draws: 0, losses: 0 };
  let accSum = 0, accCount = 0;

  for (const g of games) {
    if (g.result === "win") wins++;
    else if (g.result === "loss") losses++;
    else draws++;
    const bucket = g.myColor === "white" ? aw : ab;
    if (g.result === "win") bucket.wins++;
    else if (g.result === "loss") bucket.losses++;
    else bucket.draws++;
    if (g.accuracy != null) { accSum += g.accuracy; accCount++; }
  }

  // games sorted by endTime desc; current streak from start
  let currentStreak = 0;
  if (games.length) {
    const first = games[0].result;
    if (first === "win" || first === "loss") {
      const sign = first === "win" ? 1 : -1;
      for (const g of games) {
        if (g.result === first) currentStreak += sign;
        else break;
      }
    }
  }

  // Latest rating: most recent game with rating
  const rated = games.find((g) => g.myRating != null);
  const rating = rated?.myRating ?? null;

  // Rating delta: rating - (rating ~30 days earlier)
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const old = games.find((g) => g.endTime <= cutoff && g.myRating != null);
  const ratingDelta = rating != null && old?.myRating != null ? rating - old.myRating : 0;

  return {
    total, wins, draws, losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    drawRate: total ? Math.round((draws / total) * 100) : 0,
    lossRate: total ? Math.round((losses / total) * 100) : 0,
    asWhite: aw, asBlack: ab,
    currentStreak,
    avgAccuracy: accCount ? Math.round((accSum / accCount) * 10) / 10 : null,
    rating,
    ratingDelta,
  };
}

// Time-based rating timeline (monthly buckets)
export function ratingTimeline(games: StoredGame[]): { date: string; rating: number }[] {
  const buckets = new Map<string, { sum: number; count: number; ts: number }>();
  for (const g of games) {
    if (g.myRating == null) continue;
    const d = new Date(g.endTime * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(key) ?? { sum: 0, count: 0, ts: d.getTime() };
    b.sum += g.myRating; b.count++;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[1].ts - b[1].ts)
    .slice(-6)
    .map(([key, b]) => ({
      date: new Date(b.ts).toLocaleString("en", { month: "short" }),
      rating: Math.round(b.sum / b.count),
    }));
}

// Skills derived heuristically from real game data
export function computeSkills(games: StoredGame[]): { name: string; value: number; delta: number }[] {
  const stats = computeStats(games);
  const recent = games.slice(0, Math.min(20, games.length));
  const older = games.slice(20, 40);
  const recentWR = winRate(recent);
  const olderWR = winRate(older);
  const wrDelta = Math.round(recentWR - olderWR);

  // Long games (>40 moves) with wins -> endgame skill proxy
  const long = games.filter((g) => g.movesCount >= 40);
  const endgameWR = winRate(long);

  // Defense skill: win/draw rate as black
  const blackGames = games.filter((g) => g.myColor === "black");
  const defenseWR = blackGames.length
    ? Math.round(((blackGames.filter((g) => g.result === "win").length + blackGames.filter((g) => g.result === "draw").length * 0.5) / blackGames.length) * 100)
    : 50;

  // Time mgmt: blitz/bullet wins
  const fast = games.filter((g) => /^(60|120|180|300)/.test(g.timeControl));
  const fastWR = winRate(fast);

  // Tactics: short decisive games
  const short = games.filter((g) => g.movesCount > 0 && g.movesCount < 30 && g.result !== "draw");
  const tacticsWR = short.length ? Math.round((short.filter((g) => g.result === "win").length / short.length) * 100) : 50;

  // Openings: avg accuracy * winrate proxy
  const openingScore = stats.avgAccuracy != null
    ? Math.round((stats.avgAccuracy * 0.6 + stats.winRate * 0.4))
    : Math.round(50 + (stats.winRate - 50) * 0.6);

  // Positional: long-game draw rate + rating change
  const positionalScore = clamp(50 + (stats.winRate - 50) * 0.5 + stats.ratingDelta * 0.2, 0, 100);

  return [
    { name: "Openings", value: clamp(openingScore, 0, 100), delta: wrDelta },
    { name: "Tactics", value: clamp(tacticsWR, 0, 100), delta: wrDelta },
    { name: "Positional", value: Math.round(positionalScore), delta: Math.round(stats.ratingDelta / 5) },
    { name: "Endgames", value: clamp(endgameWR, 0, 100), delta: wrDelta },
    { name: "Defense", value: clamp(defenseWR, 0, 100), delta: 0 },
    { name: "Time Mgmt", value: clamp(fastWR, 0, 100), delta: 0 },
  ];
}

function winRate(g: StoredGame[]) {
  if (!g.length) return 50;
  return Math.round((g.filter((x) => x.result === "win").length / g.length) * 100);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// Mistake/blunder detection — heuristic since we don't have engine eval:
// Flag: short losses (<25 moves), losses ending in checkmate, low-accuracy losses.
export interface DetectedIssue {
  game: StoredGame;
  type: "Blunder" | "Mistake" | "Inaccuracy";
  reason: string;
}

export function detectIssues(games: StoredGame[]): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  for (const g of games) {
    if (g.result !== "loss") continue;
    if (g.movesCount > 0 && g.movesCount < 22) {
      issues.push({ game: g, type: "Blunder", reason: `Lost in only ${g.movesCount} moves — likely an early tactical blunder.` });
      continue;
    }
    if (g.accuracy != null && g.accuracy < 70) {
      issues.push({ game: g, type: "Blunder", reason: `Accuracy only ${g.accuracy}% — multiple decisive errors.` });
      continue;
    }
    if (/checkmate/i.test(g.termination) && g.movesCount < 35) {
      issues.push({ game: g, type: "Mistake", reason: `Got mated in ${g.movesCount} moves — defensive lapse.` });
      continue;
    }
    if (g.accuracy != null && g.accuracy < 80) {
      issues.push({ game: g, type: "Inaccuracy", reason: `Accuracy ${g.accuracy}% — drifted in a winnable position.` });
    }
  }
  return issues.slice(0, 30);
}
