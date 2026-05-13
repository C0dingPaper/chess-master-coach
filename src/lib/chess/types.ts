export type Platform = "chess.com" | "lichess";
export type Color = "white" | "black";
export type Result = "win" | "loss" | "draw";

export interface StoredGame {
  id: string;            // platform:gameId
  platform: Platform;
  gameId: string;
  url: string;
  pgn: string;
  whiteUser: string;
  blackUser: string;
  whiteRating: number | null;
  blackRating: number | null;
  myColor: Color;
  result: Result;
  termination: string;   // e.g. "checkmate", "resignation", "timeout"
  opening: string;
  eco: string;
  timeControl: string;
  movesCount: number;
  endTime: number;       // unix seconds
  myRating: number | null;
  oppRating: number | null;
  oppName: string;
  accuracy: number | null;
}

export interface RepertoireLine {
  id: string;
  name: string;
  color: Color;
  eco: string;
  pgn: string;            // moves like "1. e4 e5 2. Nf3 Nc6 3. Bc4"
  note: string;
  createdAt: number;
}

export interface PinnedPosition {
  id: string;
  fen: string;
  myMove: string;          // SAN of the move you committed to
  label: string;
  note: string;
  lineId: string | null;
  createdAt: number;
  // SRS state (SM-2)
  ease: number;            // default 2.5
  interval: number;        // days
  reps: number;
  due: number;             // unix ms
  lastReviewed: number | null;
}

export interface Connection {
  username: string;
  platform: Platform;
  linkedAt: number;
  lastImport: number | null;
}
