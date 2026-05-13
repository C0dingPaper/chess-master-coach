import { Chess, type Move as ChessMove } from "chess.js";
import type { EngineEvaluation } from "@/lib/chess/engine-evaluation";

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const CENTER_SQUARES = new Set(["d4", "e4", "d5", "e5"]);
const NEAR_CENTER_SQUARES = new Set([
  "c3",
  "d3",
  "e3",
  "f3",
  "c4",
  "f4",
  "c5",
  "f5",
  "c6",
  "d6",
  "e6",
  "f6",
]);

function uciFromMove(move: ChessMove) {
  return `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
}

function withTurn(fen: string, turn: "w" | "b") {
  const parts = fen.split(" ");
  parts[1] = turn;
  return parts.join(" ");
}

function squareBonus(piece: string, square: string) {
  const lower = piece.toLowerCase();
  let bonus = 0;

  if (CENTER_SQUARES.has(square)) bonus += lower === "p" ? 12 : 18;
  else if (NEAR_CENTER_SQUARES.has(square)) bonus += lower === "p" ? 6 : 10;

  const rank = Number(square[1]);
  const advancement = piece === piece.toUpperCase() ? rank - 2 : 7 - rank;
  if (lower === "p") bonus += Math.max(0, advancement) * 5;
  if ((lower === "n" || lower === "b") && (square[1] === "1" || square[1] === "8")) bonus -= 14;

  return bonus;
}

function mobilityFor(fen: string, turn: "w" | "b") {
  try {
    return new Chess(withTurn(fen, turn)).moves().length;
  } catch {
    return 0;
  }
}

export function evaluateFenFast(fen: string): EngineEvaluation {
  const chess = new Chess(fen);
  const board = chess.board();
  let whiteCp = 0;

  for (let rank = 0; rank < board.length; rank += 1) {
    for (let file = 0; file < board[rank].length; file += 1) {
      const piece = board[rank][file];
      if (!piece) continue;

      const square = `${"abcdefgh"[file]}${8 - rank}`;
      const value =
        PIECE_VALUES[piece.type] +
        squareBonus(piece.color === "w" ? piece.type.toUpperCase() : piece.type, square);
      whiteCp += piece.color === "w" ? value : -value;
    }
  }

  whiteCp += (mobilityFor(fen, "w") - mobilityFor(fen, "b")) * 3;
  if (chess.inCheck()) whiteCp += chess.turn() === "w" ? -35 : 35;
  if (chess.isCheckmate()) whiteCp = chess.turn() === "w" ? -100000 : 100000;
  if (chess.isDraw()) whiteCp = 0;

  const sideToMove = chess.turn();
  const legalMoves = chess.moves({ verbose: true });
  let bestMove: string | null = null;
  let bestScore = sideToMove === "w" ? -Infinity : Infinity;

  for (const move of legalMoves) {
    const next = new Chess(fen);
    const played = next.move({ from: move.from, to: move.to, promotion: move.promotion });
    if (!played) continue;
    const nextWhiteCp = evaluateStaticWhite(next);
    if (
      (sideToMove === "w" && nextWhiteCp > bestScore) ||
      (sideToMove === "b" && nextWhiteCp < bestScore)
    ) {
      bestScore = nextWhiteCp;
      bestMove = uciFromMove(played);
    }
  }

  return {
    bestMove,
    cp: sideToMove === "w" ? whiteCp : -whiteCp,
    mate: Math.abs(whiteCp) >= 100000 ? (whiteCp > 0 ? 1 : -1) : null,
    depth: 1,
  };
}

function evaluateStaticWhite(chess: Chess) {
  const fen = chess.fen();
  const board = chess.board();
  let whiteCp = 0;

  for (let rank = 0; rank < board.length; rank += 1) {
    for (let file = 0; file < board[rank].length; file += 1) {
      const piece = board[rank][file];
      if (!piece) continue;

      const square = `${"abcdefgh"[file]}${8 - rank}`;
      const value =
        PIECE_VALUES[piece.type] +
        squareBonus(piece.color === "w" ? piece.type.toUpperCase() : piece.type, square);
      whiteCp += piece.color === "w" ? value : -value;
    }
  }

  whiteCp += (mobilityFor(fen, "w") - mobilityFor(fen, "b")) * 3;
  if (chess.inCheck()) whiteCp += chess.turn() === "w" ? -35 : 35;
  if (chess.isCheckmate()) return chess.turn() === "w" ? -100000 : 100000;
  if (chess.isDraw()) return 0;
  return whiteCp;
}
