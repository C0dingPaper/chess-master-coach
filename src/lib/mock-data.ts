// Mock data for the dashboard shell
export type GameResult = "win" | "loss" | "draw";

export interface Game {
  id: string;
  date: string;
  opponent: string;
  opponentRating: number;
  myRating: number;
  result: GameResult;
  color: "white" | "black";
  opening: string;
  eco: string;
  timeControl: string;
  moves: number;
  accuracy: number;
  platform: "chess.com" | "lichess";
}

export const mockGames: Game[] = [
  { id: "1", date: "2026-05-12", opponent: "knightrider88", opponentRating: 1842, myRating: 1810, result: "win", color: "white", opening: "Italian Game", eco: "C50", timeControl: "10+0", moves: 38, accuracy: 91.2, platform: "chess.com" },
  { id: "2", date: "2026-05-12", opponent: "queen_takes_all", opponentRating: 1798, myRating: 1815, result: "loss", color: "black", opening: "Sicilian Najdorf", eco: "B90", timeControl: "5+3", moves: 52, accuracy: 78.4, platform: "chess.com" },
  { id: "3", date: "2026-05-11", opponent: "pawnstorm", opponentRating: 1820, myRating: 1810, result: "win", color: "white", opening: "Italian Game", eco: "C50", timeControl: "10+0", moves: 41, accuracy: 88.7, platform: "lichess" },
  { id: "4", date: "2026-05-10", opponent: "endgame_eddie", opponentRating: 1855, myRating: 1808, result: "draw", color: "black", opening: "Caro-Kann", eco: "B12", timeControl: "15+10", moves: 67, accuracy: 92.1, platform: "lichess" },
  { id: "5", date: "2026-05-10", opponent: "rookie_no_more", opponentRating: 1780, myRating: 1812, result: "win", color: "white", opening: "London System", eco: "D02", timeControl: "10+0", moves: 33, accuracy: 89.5, platform: "chess.com" },
  { id: "6", date: "2026-05-09", opponent: "tactics_titan", opponentRating: 1890, myRating: 1810, result: "loss", color: "black", opening: "King's Indian", eco: "E60", timeControl: "5+0", moves: 44, accuracy: 72.3, platform: "chess.com" },
  { id: "7", date: "2026-05-08", opponent: "blunder_buster", opponentRating: 1795, myRating: 1815, result: "win", color: "white", opening: "Italian Game", eco: "C50", timeControl: "10+0", moves: 36, accuracy: 90.0, platform: "lichess" },
  { id: "8", date: "2026-05-07", opponent: "bishop_pair", opponentRating: 1830, myRating: 1820, result: "draw", color: "white", opening: "Italian Game", eco: "C54", timeControl: "10+0", moves: 58, accuracy: 86.2, platform: "chess.com" },
];

export interface OpeningNode {
  move: string;
  san: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  inRepertoire?: boolean;
  children?: OpeningNode[];
}

export const openingTree: OpeningNode = {
  move: "start", san: "Start", count: 142, wins: 71, draws: 28, losses: 43,
  children: [
    {
      move: "1.e4", san: "e4", count: 89, wins: 47, draws: 16, losses: 26, inRepertoire: true,
      children: [
        { move: "1...e5", san: "e5", count: 51, wins: 31, draws: 8, losses: 12, inRepertoire: true,
          children: [
            { move: "2.Nf3", san: "Nf3", count: 49, wins: 30, draws: 8, losses: 11, inRepertoire: true,
              children: [
                { move: "2...Nc6", san: "Nc6", count: 44, wins: 28, draws: 7, losses: 9,
                  children: [
                    { move: "3.Bc4", san: "Bc4 (Italian)", count: 38, wins: 26, draws: 5, losses: 7, inRepertoire: true },
                    { move: "3.Bb5", san: "Bb5 (Spanish)", count: 6, wins: 2, draws: 2, losses: 2 },
                  ]},
              ]},
          ]},
        { move: "1...c5", san: "c5 (Sicilian)", count: 24, wins: 9, draws: 4, losses: 11 },
        { move: "1...e6", san: "e6 (French)", count: 8, wins: 4, draws: 2, losses: 2 },
        { move: "1...c6", san: "c6 (Caro-Kann)", count: 6, wins: 3, draws: 2, losses: 1 },
      ],
    },
    {
      move: "1.d4", san: "d4", count: 38, wins: 18, draws: 9, losses: 11,
      children: [
        { move: "1...Nf6", san: "Nf6 (Indian)", count: 22, wins: 9, draws: 5, losses: 8 },
        { move: "1...d5", san: "d5", count: 14, wins: 8, draws: 4, losses: 2 },
      ],
    },
    { move: "1.Nf3", san: "Nf3 (Réti)", count: 15, wins: 6, draws: 3, losses: 6 },
  ],
};

export const skills = [
  { name: "Openings", value: 78, delta: 4, color: "var(--gold)" },
  { name: "Tactics", value: 64, delta: -2, color: "var(--chart-3)" },
  { name: "Positional", value: 71, delta: 3, color: "var(--chart-4)" },
  { name: "Endgames", value: 52, delta: 1, color: "var(--chart-2)" },
  { name: "Defense", value: 58, delta: 2, color: "var(--chart-5)" },
  { name: "Time Mgmt", value: 69, delta: 5, color: "var(--gold)" },
];

export const ratingHistory = [
  { date: "Jan", rating: 1742 },
  { date: "Feb", rating: 1768 },
  { date: "Mar", rating: 1755 },
  { date: "Apr", rating: 1789 },
  { date: "May", rating: 1812 },
];

export const mistakes = [
  { id: "m1", game: "vs queen_takes_all", move: 23, type: "Blunder", description: "Missed defense of the f7 square", betterMove: "Rf8", evalDrop: "-3.4" },
  { id: "m2", game: "vs tactics_titan", move: 18, type: "Inaccuracy", description: "Allowed a pin on the e-file", betterMove: "Re8", evalDrop: "-1.2" },
  { id: "m3", game: "vs tactics_titan", move: 31, type: "Mistake", description: "Traded into a losing pawn endgame", betterMove: "Kf6", evalDrop: "-2.1" },
  { id: "m4", game: "vs queen_takes_all", move: 35, type: "Blunder", description: "Hanging knight on d5", betterMove: "Nc7", evalDrop: "-4.8" },
];

export const stats = {
  rating: 1812,
  ratingDelta: +24,
  totalGames: 142,
  winRate: 50,
  drawRate: 19,
  lossRate: 31,
  streak: 3,
};
