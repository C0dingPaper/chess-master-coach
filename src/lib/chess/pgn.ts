import { Chess } from "chess.js";
import type { Color, Result, StoredGame } from "./types";

function tag(pgn: string, key: string): string | null {
  const re = new RegExp(`\\[${key}\\s+"([^"]*)"\\]`);
  const m = pgn.match(re);
  return m ? m[1] : null;
}

function parseRating(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export interface ParsedGameMeta {
  whiteUser: string;
  blackUser: string;
  whiteRating: number | null;
  blackRating: number | null;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  termination: string;
  opening: string;
  eco: string;
  timeControl: string;
  movesCount: number;
  endTime: number;
}

export function parsePgnMeta(pgn: string): ParsedGameMeta {
  const chess = new Chess();
  let movesCount = 0;
  try {
    chess.loadPgn(pgn, { strict: false });
    movesCount = chess.history().length;
  } catch {
    movesCount = 0;
  }

  const result = (tag(pgn, "Result") ?? "*") as ParsedGameMeta["result"];
  const dateStr = tag(pgn, "UTCDate") ?? tag(pgn, "Date") ?? "";
  const timeStr = tag(pgn, "UTCTime") ?? tag(pgn, "Time") ?? "00:00:00";
  const ts = Date.parse(`${dateStr.replace(/\./g, "-")}T${timeStr}Z`);
  const endTime = Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000);

  return {
    whiteUser: tag(pgn, "White") ?? "",
    blackUser: tag(pgn, "Black") ?? "",
    whiteRating: parseRating(tag(pgn, "WhiteElo")),
    blackRating: parseRating(tag(pgn, "BlackElo")),
    result,
    termination: tag(pgn, "Termination") ?? "",
    opening:
      tag(pgn, "Opening") ?? tag(pgn, "ECOUrl")?.split("/").pop()?.replace(/-/g, " ") ?? "Unknown",
    eco: tag(pgn, "ECO") ?? "—",
    timeControl: tag(pgn, "TimeControl") ?? "",
    movesCount,
    endTime,
  };
}

function determineResult(meta: ParsedGameMeta, myColor: Color): Result {
  if (meta.result === "1/2-1/2") return "draw";
  if (meta.result === "1-0") return myColor === "white" ? "win" : "loss";
  if (meta.result === "0-1") return myColor === "black" ? "win" : "loss";
  return "draw";
}

export function buildStoredGame(args: {
  platform: "chess.com" | "lichess";
  gameId: string;
  url: string;
  pgn: string;
  username: string;
  accuracy?: number | null;
}): StoredGame {
  const meta = parsePgnMeta(args.pgn);
  const myColor: Color =
    meta.whiteUser.toLowerCase() === args.username.toLowerCase() ? "white" : "black";
  const result = determineResult(meta, myColor);
  return {
    id: `${args.platform}:${args.gameId}`,
    platform: args.platform,
    gameId: args.gameId,
    url: args.url,
    pgn: args.pgn,
    whiteUser: meta.whiteUser,
    blackUser: meta.blackUser,
    whiteRating: meta.whiteRating,
    blackRating: meta.blackRating,
    myColor,
    result,
    termination: meta.termination,
    opening: meta.opening,
    eco: meta.eco,
    timeControl: meta.timeControl,
    movesCount: meta.movesCount,
    endTime: meta.endTime,
    myRating: myColor === "white" ? meta.whiteRating : meta.blackRating,
    oppRating: myColor === "white" ? meta.blackRating : meta.whiteRating,
    oppName: myColor === "white" ? meta.blackUser : meta.whiteUser,
    accuracy: args.accuracy ?? null,
  };
}

/** Returns the SAN moves array (no move numbers) from a PGN. */
export function pgnToSanMoves(pgn: string): string[] {
  try {
    const c = new Chess();
    c.loadPgn(pgn, { strict: false });
    return c.history();
  } catch {
    return [];
  }
}
