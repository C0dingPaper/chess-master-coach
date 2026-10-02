import type { StoredGame } from "./types";

export interface FocusArea {
  id: string;
  title: string;
  evidence: string;
  action: string;
  priority: number;
  sample: number;
}

function score(games: StoredGame[]) {
  return games.length
    ? games.reduce(
        (sum, game) => sum + (game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0),
        0,
      ) / games.length
    : 0;
}

/** Result-based focus areas; no rating trend or invented engine conclusions. */
export function computeFocusAreas(games: StoredGame[]): FocusArea[] {
  if (!games.length) return [];
  const candidates: FocusArea[] = [];
  const total = games.length;
  const losses = games.filter((game) => game.result === "loss");
  const timeLosses = losses.filter((game) =>
    /timeout|time\s*out|time forfeit|on time/i.test(game.termination),
  );
  if (timeLosses.length)
    candidates.push({
      id: "clock",
      title: "Clock management",
      evidence: `${timeLosses.length} of ${total} games ended in a loss on time.`,
      action:
        "Set checkpoints for your remaining time. Make a practical move when calculation starts taking too long.",
      priority: timeLosses.length / total,
      sample: total,
    });

  // Imported movesCount counts half-moves, so 40 plies is 20 full moves.
  const earlyLosses = losses.filter((game) => game.movesCount > 0 && game.movesCount <= 40);
  if (earlyLosses.length)
    candidates.push({
      id: "early",
      title: "Avoiding early losses",
      evidence: `${earlyLosses.length} of ${total} games were lost within 20 moves.`,
      action:
        "Replay those games. Before each move, check the opponent’s checks, captures, and threats; prioritize development and king safety.",
      priority: earlyLosses.length / total,
      sample: total,
    });

  const openings = new Map<string, StoredGame[]>();
  for (const game of games) {
    if (!game.opening || /^unknown/i.test(game.opening)) continue;
    const key = `${game.myColor}\u0000${game.opening}`;
    const group = openings.get(key) ?? [];
    group.push(game);
    openings.set(key, group);
  }
  const weakestOpening = [...openings.values()]
    .filter((group) => group.length >= 3 && score(group) < 0.5)
    .sort((a, b) => score(a) - score(b) || b.length - a.length)[0];
  if (weakestOpening) {
    const first = weakestOpening[0];
    const wins = weakestOpening.filter((game) => game.result === "win").length;
    const draws = weakestOpening.filter((game) => game.result === "draw").length;
    candidates.push({
      id: "opening",
      title: `${first.opening} as ${first.myColor}`,
      evidence: `${wins} wins, ${draws} draws, ${weakestOpening.length - wins - draws} losses in ${weakestOpening.length} games.`,
      action:
        "Review the first 10–12 moves of these games. Learn the key plans and prepare one dependable line.",
      priority: (1 - score(weakestOpening)) * Math.min(1, weakestOpening.length / 10),
      sample: weakestOpening.length,
    });
  }

  const longerGames = games.filter((game) => game.movesCount >= 80);
  const longerLosses = longerGames.filter((game) => game.result === "loss");
  if (longerGames.length >= 3 && longerLosses.length)
    candidates.push({
      id: "long",
      title: "Finishing longer games",
      evidence: `${longerLosses.length} losses in ${longerGames.length} games lasting at least 40 moves.`,
      action:
        "Review the final phase of these losses. Practice king activity, pawn endings, and rook endings from the positions you actually reached.",
      priority: (longerLosses.length / longerGames.length) * Math.min(1, longerGames.length / 10),
      sample: longerGames.length,
    });

  const white = games.filter((game) => game.myColor === "white");
  const black = games.filter((game) => game.myColor === "black");
  if (white.length >= 3 && black.length >= 3 && Math.abs(score(white) - score(black)) >= 0.1) {
    const weaker = score(white) < score(black) ? white : black;
    const color = weaker[0].myColor;
    candidates.push({
      id: "color",
      title: `Consistency as ${color}`,
      evidence: `${Math.round(score(weaker) * 100)}% score as ${color}, compared with ${Math.round(score(weaker === white ? black : white) * 100)}% with the other color.`,
      action:
        color === "black"
          ? "Prepare a clear response to 1.e4 and 1.d4. Review how you develop and complete king safety before counterattacking."
          : "Choose a consistent first move and practice its typical plans. Review how you use your development advantage.",
      priority: Math.abs(score(white) - score(black)),
      sample: weaker.length,
    });
  }

  const accuracyGames = games.filter((game) => game.accuracy != null);
  const lowAccuracy = accuracyGames.filter((game) => game.accuracy! < 70);
  if (accuracyGames.length >= 3 && lowAccuracy.length)
    candidates.push({
      id: "accuracy",
      title: "Move accuracy",
      evidence: `${lowAccuracy.length} of ${accuracyGames.length} games with supplied accuracy scored below 70%.`,
      action:
        "Analyze those games and revisit the largest errors. Practice calculating checks, captures, and forcing replies before choosing a move.",
      priority:
        (lowAccuracy.length / accuracyGames.length) * Math.min(1, accuracyGames.length / 10),
      sample: accuracyGames.length,
    });

  const ranked = candidates
    .sort((a, b) => b.priority - a.priority || b.sample - a.sample)
    .slice(0, 3);
  const fallbacks = [
    {
      id: "review",
      title: "Review your critical decisions",
      evidence: `${losses.length} losses across ${total} imported games; no additional recurring pattern is established.`,
      action: losses.length
        ? "Analyze a loss and compare your decisions with Stockfish’s suggestions."
        : "Review a close win or draw and compare your decisions with Stockfish’s suggestions.",
    },
    {
      id: "repertoire",
      title: "Consolidate your openings",
      evidence: `${openings.size} opening-and-color combinations in your imported games.`,
      action: "Choose the lines you play most often and review their typical plans.",
    },
    {
      id: "practice",
      title: "Turn reviews into practice",
      evidence: "The available game records do not establish another distinct weakness yet.",
      action:
        "Revisit key positions from your games and explain your move before checking the engine.",
    },
  ];
  for (const fallback of fallbacks) {
    if (ranked.length === 3) break;
    ranked.push({ ...fallback, priority: 0, sample: total });
  }
  return ranked;
}
