import { timeFormatLabel } from "@/lib/chess/time-format";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { EmptyConnect } from "@/components/empty-connect";
import { useGames, useIsClient } from "@/lib/chess/hooks";
import { evaluationToCentipawns, type EngineEvaluation } from "@/lib/chess/engine-evaluation";
import { StockfishClient } from "@/lib/chess/stockfish";
import type { Color, StoredGame } from "@/lib/chess/types";
import { Chess, DEFAULT_POSITION, type Move as ChessMove } from "chess.js";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChessboardOptions } from "react-chessboard";
import { ChessBoard } from "@/components/chess-board";

export const Route = createFileRoute("/app/games_/$gameId")({
  head: () => ({ meta: [{ title: "Game Review - NeverPay4Chess" }] }),
  component: GameReviewPage,
});

type AnnotationKind =
  | "pending"
  | "test"
  | "brilliancy"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

type BoardMove = {
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  before: string;
  after: string;
};

type ReviewMove = BoardMove & {
  ply: number;
};

type VariationMove = BoardMove & {
  id: string;
};

type MoveAnalysis = {
  annotation: AnnotationKind;
  bestMove: string | null;
  bestSan: string | null;
  depth: number;
  loss: number | null;
  evalAfter: number | null;
  evalBest: number | null;
  evalBeforeWhite: number | null;
  evalAfterWhite: number | null;
  engineError?: string;
};

type PositionEvaluation = EngineEvaluation & {
  whiteCp: number | null;
  error?: string;
};

type AnalyzeState = {
  status: "idle" | "running" | "done" | "error";
  progress: number;
  total: number;
  message: string;
};

type CoachInsight = {
  title: string;
  explanation: string;
  advice: string;
  bestSan: string | null;
  loss: number | null;
  annotation: AnnotationKind;
  depth: number;
};

type LiveEvaluationState = {
  fen: string | null;
  evaluation: PositionEvaluation | null;
  status: "idle" | "running" | "ready" | "error";
};

const EVAL_BAR_DEBOUNCE_MS = 120;
const EVAL_BAR_MOVETIME_MS = 180;
const EVAL_BAR_TIMEOUT_MS = 1400;
const EVAL_BAR_HARD_TIMEOUT_MS = 2400;
const BEST_MOVE_ARROW_COLOR = "oklch(0.78 0.16 165 / 0.9)";

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resultClass(result: StoredGame["result"]) {
  if (result === "win") return "text-win";
  if (result === "loss") return "text-loss";
  return "text-draw";
}

function annotationLabel(kind: AnnotationKind) {
  if (kind === "brilliancy") return "Brilliancy";
  if (kind === "good") return "Good";
  if (kind === "inaccuracy") return "Inaccuracy";
  if (kind === "mistake") return "Mistake";
  if (kind === "blunder") return "Blunder";
  if (kind === "test") return "Test move";
  return "Pending";
}

function annotationColor(kind: AnnotationKind) {
  if (kind === "brilliancy") return "oklch(0.7 0.16 245 / 0.85)";
  if (kind === "good") return "oklch(0.82 0.12 205 / 0.75)";
  if (kind === "inaccuracy") return "oklch(0.86 0.13 92 / 0.75)";
  if (kind === "mistake") return "oklch(0.75 0.16 55 / 0.78)";
  if (kind === "blunder") return "oklch(0.65 0.21 25 / 0.85)";
  if (kind === "test") return "oklch(0.78 0.16 75 / 0.85)";
  return "oklch(0.78 0.16 75 / 0.7)";
}

function uciFromMove(move: ChessMove) {
  return `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
}

function buildReviewMoves(game: StoredGame): ReviewMove[] {
  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn, { strict: false });
    return chess.history({ verbose: true }).map((move, index) => ({
      ply: index,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color === "w" ? "white" : "black",
      san: move.san,
      uci: uciFromMove(move),
      from: move.from,
      to: move.to,
      before: move.before,
      after: move.after,
    }));
  } catch {
    return [];
  }
}

function moveLabel(move: ReviewMove) {
  return `${move.moveNumber}${move.color === "black" ? "..." : "."} ${move.san}`;
}

function boardMoveLabel(move: BoardMove) {
  return `${move.moveNumber}${move.color === "black" ? "..." : "."} ${move.san}`;
}

function formatEval(cp: number | null) {
  if (cp == null) return "N/A";
  if (Math.abs(cp) > 90000) return cp > 0 ? "M+" : "M-";
  const pawns = cp / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function evaluationToWhiteCentipawns(fen: string, evaluation: EngineEvaluation) {
  const centipawns = evaluationToCentipawns(evaluation);
  if (centipawns == null) return null;
  const sideToMove = fen.split(" ")[1];
  return sideToMove === "b" ? -centipawns : centipawns;
}

function toPositionEvaluation(
  fen: string,
  evaluation: EngineEvaluation,
  error?: string,
): PositionEvaluation {
  return {
    ...evaluation,
    whiteCp: error ? null : evaluationToWhiteCentipawns(fen, evaluation),
    error,
  };
}

function emptyPositionEvaluation(fen: string, error: string): PositionEvaluation {
  return toPositionEvaluation(fen, { bestMove: null, cp: null, mate: null, depth: 0 }, error);
}

function isBoardSquare(square: string) {
  return /^[a-h][1-8]$/.test(square);
}

function bestMoveArrow(fen: string, bestMove: string | null) {
  const uci = bestMove?.toLowerCase();
  if (!uci || uci === "0000" || uci.length < 4) return null;

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci[4];

  if (!isBoardSquare(from) || !isBoardSquare(to)) return null;

  try {
    const chess = new Chess(fen);
    const move = promotion ? { from, to, promotion } : { from, to };
    if (!chess.move(move)) return null;
  } catch {
    return null;
  }

  return {
    startSquare: from,
    endSquare: to,
    color: BEST_MOVE_ARROW_COLOR,
  };
}

function evalBarWhitePercent(cp: number | null) {
  if (cp == null) return 50;
  if (Math.abs(cp) > 90000) return cp > 0 ? 98 : 2;
  const winningChances = 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
  return Math.round(50 + winningChances * 48);
}

function formatEvalBarLabel(cp: number | null) {
  if (cp == null) return "Eval";
  if (Math.abs(cp) <= 15) return "Equal";
  return cp > 0 ? `White ${formatEval(cp)}` : `Black ${formatEval(Math.abs(cp))}`;
}

function sanFromUci(fen: string, uci: string | null) {
  if (!uci) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

function classifyMove({
  move,
  best,
  after,
}: {
  move: ReviewMove;
  best: EngineEvaluation;
  after: EngineEvaluation;
}): MoveAnalysis {
  const bestEval = evaluationToCentipawns(best);
  const afterEval = evaluationToCentipawns(after);
  const evalBeforeWhite = evaluationToWhiteCentipawns(move.before, best);
  const evalAfterWhite = evaluationToWhiteCentipawns(move.after, after);
  const evalAfterForMover = afterEval == null ? null : -afterEval;
  const loss =
    bestEval == null || evalAfterForMover == null
      ? null
      : Math.max(0, bestEval - evalAfterForMover);
  const isBest = Boolean(best.bestMove && move.uci === best.bestMove.toLowerCase());
  const bestSan = sanFromUci(move.before, best.bestMove);

  let annotation: AnnotationKind = "good";
  if (loss == null) annotation = "pending";
  else if (isBest && (best.mate != null || (bestEval ?? 0) >= 300 || loss <= 12)) {
    annotation = best.mate != null || (bestEval ?? 0) >= 300 ? "brilliancy" : "good";
  } else if (loss >= 300) annotation = "blunder";
  else if (loss >= 160) annotation = "mistake";
  else if (loss >= 70) annotation = "inaccuracy";

  return {
    annotation,
    bestMove: best.bestMove,
    bestSan,
    depth: Math.min(best.depth, after.depth),
    loss,
    evalAfter: evalAfterForMover,
    evalBest: bestEval,
    evalBeforeWhite,
    evalAfterWhite,
  };
}

function skippedMoveAnalysis(
  move: ReviewMove,
  before: PositionEvaluation,
  after: PositionEvaluation,
): MoveAnalysis {
  return {
    annotation: "pending",
    bestMove: before.bestMove,
    bestSan: sanFromUci(move.before, before.bestMove),
    depth: Math.min(before.depth, after.depth),
    loss: null,
    evalAfter: null,
    evalBest: null,
    evalBeforeWhite: before.whiteCp,
    evalAfterWhite: after.whiteCp,
    engineError: before.error ?? after.error,
  };
}

function bestMoveMatches(move: ReviewMove, evaluation: EngineEvaluation) {
  return Boolean(evaluation.bestMove && move.uci === evaluation.bestMove.toLowerCase());
}

function exactBestMoveAnalysis(
  move: ReviewMove,
  best: PositionEvaluation,
  after: PositionEvaluation,
): MoveAnalysis {
  const bestEval = evaluationToCentipawns(best);
  const evalAfterWhite = after.whiteCp;
  const evalAfterForMover =
    evalAfterWhite == null ? null : move.color === "white" ? evalAfterWhite : -evalAfterWhite;

  return {
    annotation: best.mate != null || (bestEval ?? 0) >= 300 ? "brilliancy" : "good",
    bestMove: best.bestMove,
    bestSan: sanFromUci(move.before, best.bestMove),
    depth: Math.max(best.depth, after.depth),
    loss: 0,
    evalAfter: evalAfterForMover,
    evalBest: bestEval,
    evalBeforeWhite: best.whiteCp,
    evalAfterWhite,
  };
}

function isSuspiciousMove(move: ReviewMove, moveAnalysis: MoveAnalysis) {
  if (moveAnalysis.engineError) return false;

  if (
    moveAnalysis.annotation === "inaccuracy" ||
    moveAnalysis.annotation === "mistake" ||
    moveAnalysis.annotation === "blunder"
  ) {
    return true;
  }

  const bestMove = moveAnalysis.bestMove?.toLowerCase();

  if (!bestMove || move.uci === bestMove) return false;

  return (moveAnalysis.loss ?? 0) >= 45;
}

function isPlayerMove(move: ReviewMove | null | undefined, myColor: Color | undefined) {
  return Boolean(move && myColor && move.color === myColor);
}

function playerCentipawns(whiteCp: number | null, color: Color) {
  if (whiteCp == null) return null;
  return color === "white" ? whiteCp : -whiteCp;
}

function formatLoss(loss: number | null) {
  if (loss == null) return "an unclear amount";
  if (loss >= 90000) return "a mating advantage";
  return `${(loss / 100).toFixed(loss >= 100 ? 1 : 2)} pawns`;
}

function bestMoveTheme(bestSan: string | null) {
  if (!bestSan) return "The important part is that there was a more resilient move available.";
  if (bestSan.includes("#")) {
    return "The engine line is forcing because it creates or prevents mate.";
  }
  if (bestSan.includes("+")) {
    return "The engine move starts with check, so the opponent has less freedom to choose a plan.";
  }
  if (bestSan.includes("x")) {
    return "The engine move uses a forcing capture, usually winning material or removing a defender.";
  }
  if (bestSan.startsWith("O-O")) {
    return "The engine preferred king safety before starting other operations.";
  }
  if (bestSan.includes("=")) {
    return "The engine line is about promotion timing, where one tempo changes the result.";
  }
  return "The engine move keeps more pressure and gives the opponent fewer useful replies.";
}

function coachAdvice(kind: AnnotationKind) {
  if (kind === "blunder") {
    return "Before moves like this, pause for checks, captures, and direct threats against your king or queen. A one-move tactical scan would likely catch the problem.";
  }
  if (kind === "mistake") {
    return "Look for the opponent's strongest reply before finalizing the move. The issue is usually a tactic, loose piece, or missed forcing move.";
  }
  if (kind === "inaccuracy") {
    return "The move is playable, but it gives away pressure. Compare it with the engine move and ask what threat or improvement the engine preserved.";
  }
  if (kind === "brilliancy") {
    return "This is a strong practical decision. Keep looking for forcing ideas when your pieces are active.";
  }
  return "No major coaching issue here. The position remains close to the engine recommendation.";
}

function shouldCoachMove(move: ReviewMove, moveAnalysis: MoveAnalysis) {
  if (moveAnalysis.engineError) return false;
  if (moveAnalysis.annotation === "brilliancy") return true;
  if (
    moveAnalysis.annotation === "inaccuracy" ||
    moveAnalysis.annotation === "mistake" ||
    moveAnalysis.annotation === "blunder"
  ) {
    return true;
  }

  const bestMove = moveAnalysis.bestMove?.toLowerCase();
  return Boolean(bestMove && move.uci !== bestMove && (moveAnalysis.loss ?? 0) >= 45);
}

function buildCoachInsight(move: ReviewMove, moveAnalysis: MoveAnalysis): CoachInsight | null {
  if (!shouldCoachMove(move, moveAnalysis)) return null;

  const bestSan = moveAnalysis.bestSan;
  const playedBestMove = Boolean(
    moveAnalysis.bestMove && move.uci === moveAnalysis.bestMove.toLowerCase(),
  );
  const beforeForPlayer = playerCentipawns(moveAnalysis.evalBeforeWhite, move.color);
  const afterForPlayer = playerCentipawns(moveAnalysis.evalAfterWhite, move.color);
  const label = annotationLabel(moveAnalysis.annotation);
  const bestMoveText = bestSan ? `${bestSan}` : "the engine move";

  if (moveAnalysis.annotation === "brilliancy" || playedBestMove) {
    return {
      title: `${moveLabel(move)}: Brilliancy`,
      explanation: bestSan
        ? `${move.san} is a strong move and matches the engine's idea. It keeps the position around ${formatEval(
            afterForPlayer,
          )} for you while finding ${bestMoveTheme(bestSan).toLowerCase()}`
        : `${move.san} is a strong practical decision. The position stays around ${formatEval(
            afterForPlayer,
          )} for you.`,
      advice: coachAdvice(moveAnalysis.annotation),
      bestSan,
      loss: moveAnalysis.loss,
      annotation: moveAnalysis.annotation,
      depth: moveAnalysis.depth,
    };
  }

  const titleLabel =
    moveAnalysis.annotation === "good" || moveAnalysis.annotation === "pending"
      ? "Tactical miss"
      : label;

  return {
    title: `${moveLabel(move)}: ${titleLabel}`,
    explanation: `${move.san} is a ${titleLabel.toLowerCase()} because it gives up about ${formatLoss(
      moveAnalysis.loss,
    )} compared with ${bestMoveText}. Before the move the position was ${formatEval(
      beforeForPlayer,
    )} for you; after it, the position is ${formatEval(afterForPlayer)}. ${bestMoveTheme(bestSan)}`,
    advice: coachAdvice(moveAnalysis.annotation),
    bestSan,
    loss: moveAnalysis.loss,
    annotation: moveAnalysis.annotation,
    depth: moveAnalysis.depth,
  };
}

function summarizeAnalysis(analysis: Record<number, MoveAnalysis>) {
  const values = Object.values(analysis);
  return {
    brilliancy: values.filter((item) => item.annotation === "brilliancy").length,
    good: values.filter((item) => item.annotation === "good").length,
    inaccuracy: values.filter((item) => item.annotation === "inaccuracy").length,
    mistake: values.filter((item) => item.annotation === "mistake").length,
    blunder: values.filter((item) => item.annotation === "blunder").length,
  };
}

function selectedSquareStyles(
  move: BoardMove | null,
  annotation: AnnotationKind,
  selectedSquare: string | null,
  markedSquares: string[],
) {
  const styles: Record<string, React.CSSProperties> = {};
  if (!move && !selectedSquare && markedSquares.length === 0) return styles;
  const color = annotationColor(annotation);
  for (const square of markedSquares) {
    styles[square] = {
      boxShadow: "inset 0 0 0 4px oklch(0.78 0.16 75 / 0.9)",
    };
  }
  if (move) {
    styles[move.from] = {
      ...(styles[move.from] ?? {}),
      background: `radial-gradient(circle, ${color} 0%, ${color} 34%, transparent 36%)`,
    };
    styles[move.to] = {
      ...(styles[move.to] ?? {}),
      background: `linear-gradient(135deg, ${color}, transparent 70%)`,
      boxShadow: `inset 0 0 0 3px ${color}`,
    };
  }
  if (selectedSquare) {
    styles[selectedSquare] = {
      ...(styles[selectedSquare] ?? {}),
      boxShadow: "inset 0 0 0 3px oklch(0.78 0.16 75)",
    };
  }
  return styles;
}

function legalBoardMove(fen: string, from: string, to: string): VariationMove | null {
  try {
    const chess = new Chess(fen);
    const color: Color = chess.turn() === "w" ? "white" : "black";
    const moveNumber = Number(fen.split(" ")[5] ?? "1") || 1;
    const move = chess.move({ from, to, promotion: "q" });
    if (!move) return null;
    return {
      id: `${move.before}-${uciFromMove(move)}`,
      moveNumber,
      color,
      san: move.san,
      uci: uciFromMove(move),
      from: move.from,
      to: move.to,
      before: move.before,
      after: move.after,
    };
  } catch {
    return null;
  }
}

function VariationMovePill({
  move,
  index,
  active,
  onFocus,
  onDeleteFrom,
  onDeleteAll,
}: {
  move: VariationMove;
  index: number;
  active: boolean;
  onFocus: () => void;
  onDeleteFrom: () => void;
  onDeleteAll: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onFocus}
          className={`px-2 py-1 text-left font-mono text-xs hover:bg-muted ${active ? "bg-muted font-semibold" : ""}`}
        >
          <span className="mr-1 text-[10px] text-muted-foreground">
            {move.moveNumber}
            {move.color === "black" ? "..." : "."}
          </span>
          {move.san}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel className="font-mono text-xs">
          Sub move {index + 1} - {boardMoveLabel(move)}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onDeleteFrom}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete from here
        </ContextMenuItem>
        <ContextMenuItem onSelect={onDeleteAll}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete all test moves
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function VariationLine({
  moves,
  origin,
  onFocus,
  onDeleteFrom,
  onDeleteAll,
}: {
  moves: VariationMove[];
  origin: string;
  onFocus: (index: number) => void;
  onDeleteFrom: (index: number) => void;
  onDeleteAll: () => void;
}) {
  if (moves.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-accent">
            Sub moves
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            Branch from {origin}
          </div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          Right-click a move to delete
        </div>
      </div>
      <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
        {moves.map((move, index) => (
          <VariationMovePill
            key={`${move.id}-${index}`}
            move={move}
            index={index}
            active={index === moves.length - 1}
            onFocus={() => onFocus(index)}
            onDeleteFrom={() => onDeleteFrom(index)}
            onDeleteAll={onDeleteAll}
          />
        ))}
      </div>
    </div>
  );
}

function nextMainlineMove(moves: ReviewMove[], selectedPly: number) {
  return moves[selectedPly + 1] ?? null;
}

function MoveCell({
  move,
  analysis,
  active,
  onClick,
  "data-ply": dataPly,
}: {
  move: ReviewMove | undefined;
  analysis: MoveAnalysis | undefined;
  active: boolean;
  onClick: () => void;
  "data-ply"?: number;
}) {
  if (!move) return <div />;

  const annotation = analysis?.annotation ?? "pending";

  const symbol =
    annotation === "blunder"
      ? "??"
      : annotation === "mistake"
        ? "?"
        : annotation === "inaccuracy"
          ? "?!"
          : annotation === "brilliancy"
            ? "!!"
            : "";
  return (
    <button
      type="button"
      onClick={onClick}
      data-ply={dataPly}
      aria-current={active ? "step" : undefined}
      title={
        analysis
          ? `${annotationLabel(annotation)} · ${formatEval(analysis.evalAfterWhite)}`
          : move.san
      }
      className={`min-w-0 px-3 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent ${active ? "bg-accent/15 font-semibold" : ""}`}
    >
      {move.san}
      <span className="ml-1 text-muted-foreground">{symbol}</span>
    </button>
  );
}

function EvaluationBar({
  whiteCp,
  depth,
  analyzing,
  orientation,
}: {
  whiteCp: number | null;
  depth: number | null;
  analyzing: boolean;
  orientation: Color;
}) {
  const whitePct = evalBarWhitePercent(whiteCp);
  return (
    <div
      className="relative order-first w-5 shrink-0 overflow-hidden bg-[#333333]"
      aria-label={formatEvalBarLabel(whiteCp)}
      title={depth == null ? "Position evaluation" : `Depth ${depth}`}
    >
      <div
        className="absolute inset-0 bg-[#eeeeee]"
        style={{
          transform: `scaleY(${whitePct / 100})`,
          transformOrigin: orientation === "white" ? "bottom" : "top",
        }}
      />
      <span
        className="absolute bottom-1 left-0 w-full text-center text-[9px] font-semibold"
        style={{ color: orientation === "white" ? "#333333" : "#eeeeee" }}
      >
        {analyzing && whiteCp == null ? "…" : formatEval(whiteCp)}
      </span>
    </div>
  );
}

function fittedBoardWidth(availableWidth: number, viewportHeight: number) {
  // Leave room for the app header, move controls, and breathing space.
  return Math.min(availableWidth, Math.max(80, viewportHeight - 184));
}

function centerReviewBoard(board: HTMLDivElement | null) {
  requestAnimationFrame(() => {
    board?.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    });
  });
}

function GameReviewPage() {
  const { gameId } = Route.useParams();
  const decodedGameId = decodeURIComponent(gameId);
  const isClient = useIsClient();
  const games = useGames();
  const game = games.find((item) => item.id === decodedGameId);
  const moves = useMemo(() => (game ? buildReviewMoves(game) : []), [game]);
  const notationRef = useRef<HTMLDivElement>(null);
  const evaluationCacheRef = useRef(new Map<string, PositionEvaluation>());
  const liveEvaluationCacheRef = useRef(new Map<string, PositionEvaluation>());
  const liveEvaluationEngineRef = useRef<StockfishClient | null>(null);
  const analysisEngineRef = useRef<StockfishClient | null>(null);
  const analysisRunRef = useRef(0);
  const [selectedPly, setSelectedPly] = useState(0);
  const [reviewPanelCollapsed, setReviewPanelCollapsed] = useState(false);
  const boardFrameRef = useRef<HTMLDivElement>(null);
  const boardScrollIntentRef = useRef(false);
  const boardResizeRef = useRef<{ pointerId: number; x: number; y: number; width: number } | null>(
    null,
  );
  const [boardWidth, setBoardWidth] = useState<number | null>(null);
  const [boardAvailableWidth, setBoardAvailableWidth] = useState(684);
  const canDisplayBoard = Boolean(game && moves.length);
  const boardWidthClass = "max-w-full";
  const boardWidthStyle = {
    width: Math.min(boardWidth ?? 684, boardAvailableWidth),
    maxWidth: "min(100%, max(80px, calc(100dvh - 184px)))",
  };
  useEffect(() => {
    const board = boardFrameRef.current;
    const container = board?.parentElement;
    if (!canDisplayBoard || !board || !container) return;
    let measureFrame = 0;
    let centerFrame = 0;
    let previousGeometry = "";
    function measure() {
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const geometry = `${container!.clientWidth}:${window.innerWidth}:${viewportHeight}`;
        if (geometry === previousGeometry) return;
        previousGeometry = geometry;
        const bounds = board!.getBoundingClientRect();
        const isVisible = bounds.bottom > 56 && bounds.top < viewportHeight;
        setBoardAvailableWidth(fittedBoardWidth(container!.clientWidth, viewportHeight));
        if (isVisible) {
          cancelAnimationFrame(centerFrame);
          centerFrame = requestAnimationFrame(() => centerReviewBoard(board));
        }
      });
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(centerFrame);
    };
  }, [decodedGameId, canDisplayBoard]);
  function resizeBoard(width: number) {
    const available = boardAvailableWidth;
    boardScrollIntentRef.current = true;
    setBoardWidth(Math.min(available, Math.max(220, width)));
  }
  useEffect(() => {
    if (!boardScrollIntentRef.current) return;
    boardScrollIntentRef.current = false;
    const frame = requestAnimationFrame(() => {
      if (boardResizeRef.current) {
        boardFrameRef.current?.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: "instant",
        });
      } else {
        centerReviewBoard(boardFrameRef.current);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [boardWidth]);
  const [boardOrientation, setBoardOrientation] = useState<Color>(game?.myColor ?? "white");
  const reviewDepth = 24;
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [markedSquares, setMarkedSquares] = useState<string[]>([]);
  const [variationMoves, setVariationMoves] = useState<VariationMove[]>([]);
  const [analysis, setAnalysis] = useState<Record<number, MoveAnalysis>>({});
  const [positionAnalysis, setPositionAnalysis] = useState<Record<number, PositionEvaluation>>({});
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>({
    status: "idle",
    progress: 0,
    total: 0,
    message: "Ready",
  });
  const coachInsights = useMemo(() => {
    const insights: Record<number, CoachInsight> = {};
    for (const move of moves) {
      const moveAnalysis = analysis[move.ply];
      if (!game || !isPlayerMove(move, game.myColor) || !moveAnalysis) continue;
      const insight = buildCoachInsight(move, moveAnalysis);
      if (insight) insights[move.ply] = insight;
    }
    return insights;
  }, [analysis, moves, game]);
  const [liveEvaluation, setLiveEvaluation] = useState<LiveEvaluationState>({
    fen: null,
    evaluation: null,
    status: "idle",
  });

  const myMoveAnalysis = useMemo(() => {
    if (!game) return {};

    return moves.reduce<Record<number, MoveAnalysis>>((visibleAnalysis, move) => {
      const moveAnalysis = analysis[move.ply];
      if (isPlayerMove(move, game.myColor) && moveAnalysis) {
        visibleAnalysis[move.ply] = moveAnalysis;
      }

      return visibleAnalysis;
    }, {});
  }, [analysis, game, moves]);

  const selectedMove = selectedPly >= 0 ? (moves[selectedPly] ?? null) : null;
  const selectedAnalysis = selectedMove ? analysis[selectedMove.ply] : undefined;
  const latestVariationMove = variationMoves[variationMoves.length - 1] ?? null;
  const displayedMove = latestVariationMove ?? selectedMove;
  const selectedIsPlayerMove = isPlayerMove(selectedMove, game?.myColor);
  const selectedCoachInsight = selectedMove ? coachInsights[selectedMove.ply] : undefined;
  const selectedAnnotation: AnnotationKind = latestVariationMove
    ? "test"
    : (selectedAnalysis?.annotation ?? "pending");
  const fen = latestVariationMove?.after ?? selectedMove?.after ?? DEFAULT_POSITION;
  const progressPct = analyzeState.total
    ? Math.round((analyzeState.progress / analyzeState.total) * 100)
    : 0;
  const summary = useMemo(() => summarizeAnalysis(myMoveAnalysis), [myMoveAnalysis]);
  const displayedPositionIndex = latestVariationMove ? null : selectedPly < 0 ? 0 : selectedPly + 1;
  const displayedPositionEvaluation =
    displayedPositionIndex == null ? null : (positionAnalysis[displayedPositionIndex] ?? null);
  const boardArrows = useMemo(() => {
    const played = displayedMove
      ? {
          startSquare: displayedMove.from,
          endSquare: displayedMove.to,
          color: annotationColor(selectedAnnotation),
        }
      : null;
    const best = latestVariationMove
      ? null
      : bestMoveArrow(fen, displayedPositionEvaluation?.bestMove ?? null);
    return [played, best].filter((arrow) => arrow !== null);
  }, [
    displayedMove,
    selectedAnnotation,
    latestVariationMove,
    fen,
    displayedPositionEvaluation?.bestMove,
  ]);
  const storedEvalWhite = latestVariationMove
    ? null
    : (selectedAnalysis?.evalAfterWhite ?? displayedPositionEvaluation?.whiteCp ?? null);
  const storedEvalDepth = latestVariationMove
    ? null
    : (selectedAnalysis?.depth ?? displayedPositionEvaluation?.depth ?? null);
  const livePositionEvaluation = liveEvaluation.fen === fen ? liveEvaluation.evaluation : null;
  const displayedEvalWhite = storedEvalWhite ?? livePositionEvaluation?.whiteCp ?? null;
  const displayedEvalDepth = storedEvalDepth ?? livePositionEvaluation?.depth ?? null;
  const isEvaluationBarLoading =
    displayedEvalWhite == null &&
    (analyzeState.status === "running" ||
      (liveEvaluation.fen === fen && liveEvaluation.status === "running"));
  const hasStoredEvaluation = storedEvalWhite != null;
  const movePairs = [];

  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ moveNumber: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] });
  }

  useEffect(() => {
    const notation = notationRef.current;
    const active = notation?.querySelector(`[data-ply="${selectedPly}"]`);
    if (!notation || !active) return;
    const container = notation.getBoundingClientRect();
    const move = active.getBoundingClientRect();
    if (move.top < container.top) notation.scrollTop -= container.top - move.top + 8;
    else if (move.bottom > container.bottom)
      notation.scrollTop += move.bottom - container.bottom + 8;
  }, [selectedPly]);

  useEffect(() => {
    if (game?.myColor) setBoardOrientation(game.myColor);
  }, [decodedGameId, game?.myColor]);

  useEffect(() => {
    return () => {
      liveEvaluationEngineRef.current?.dispose();
      liveEvaluationEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    setAnalysisEnabled(false);
    setAnalyzeState({ status: "idle", progress: 0, total: 0, message: "Ready" });
    setAnalysis({});
    setPositionAnalysis({});
    return () => {
      analysisRunRef.current += 1;
      analysisEngineRef.current?.dispose();
      analysisEngineRef.current = null;
    };
  }, [decodedGameId]);

  useEffect(() => {
    if (analyzeState.status !== "running") return;

    liveEvaluationEngineRef.current?.dispose();
    liveEvaluationEngineRef.current = null;
  }, [analyzeState.status]);

  useEffect(() => {
    if (
      !isClient ||
      !analysisEnabled ||
      !game ||
      analyzeState.status === "running" ||
      hasStoredEvaluation
    ) {
      return;
    }

    const cached = liveEvaluationCacheRef.current.get(fen);
    if (cached) {
      setLiveEvaluation({ fen, evaluation: cached, status: "ready" });
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(() => {
      setLiveEvaluation({ fen, evaluation: null, status: "running" });

      async function evaluateCurrentPosition() {
        try {
          const engine = liveEvaluationEngineRef.current ?? new StockfishClient();
          liveEvaluationEngineRef.current = engine;

          const rawEvaluation = await engine.evaluateFen(fen, {
            movetimeMs: EVAL_BAR_MOVETIME_MS,
            timeoutMs: EVAL_BAR_TIMEOUT_MS,
            hardTimeoutMs: EVAL_BAR_HARD_TIMEOUT_MS,
          });
          const positionEvaluation = toPositionEvaluation(fen, rawEvaluation);
          liveEvaluationCacheRef.current.set(fen, positionEvaluation);

          if (!canceled) {
            setLiveEvaluation({ fen, evaluation: positionEvaluation, status: "ready" });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Stockfish could not evaluate this position";
          const positionEvaluation = emptyPositionEvaluation(fen, message);

          if (!canceled) {
            setLiveEvaluation({ fen, evaluation: positionEvaluation, status: "error" });
          }

          liveEvaluationEngineRef.current?.dispose();
          liveEvaluationEngineRef.current = null;
        }
      }

      void evaluateCurrentPosition();
    }, EVAL_BAR_DEBOUNCE_MS);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [analysisEnabled, analyzeState.status, fen, game, hasStoredEvaluation, isClient]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      setSelectedSquare(null);

      if (event.key === "ArrowUp") {
        setVariationMoves([]);
        setSelectedPly(0);
        return;
      }

      if (event.key === "ArrowDown") {
        setVariationMoves([]);
        setSelectedPly(moves.length - 1);
        return;
      }

      if (event.key === "ArrowLeft") {
        if (variationMoves.length > 0) {
          setVariationMoves((current) => current.slice(0, -1));
          return;
        }
        setSelectedPly((current) => Math.max(-1, current - 1));
        return;
      }

      if (variationMoves.length === 0) {
        setSelectedPly((current) => Math.min(moves.length - 1, current + 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moves.length, variationMoves.length]);

  function flipBoard() {
    setSelectedSquare(null);
    setBoardOrientation((current) => (current === "white" ? "black" : "white"));
  }

  function resetVariation() {
    setVariationMoves([]);
    setSelectedSquare(null);
  }

  function pickMainline(ply: number) {
    resetVariation();
    setSelectedPly(ply);
  }

  function shift(delta: number) {
    setSelectedSquare(null);
    if (variationMoves.length > 0 && delta < 0) {
      setVariationMoves((current) => current.slice(0, -1));
      return;
    }
    if (variationMoves.length > 0) return;
    setSelectedPly((current) => Math.max(-1, Math.min(moves.length - 1, current + delta)));
  }

  function focusVariation(index: number) {
    setSelectedSquare(null);
    setVariationMoves((current) => current.slice(0, index + 1));
  }

  function deleteVariationFrom(index: number) {
    setSelectedSquare(null);
    setVariationMoves((current) => current.slice(0, index));
  }

  const playBoardMove = useCallback(
    (from: string, to: string) => {
      const move = legalBoardMove(fen, from, to);
      setSelectedSquare(null);
      if (!move) return false;

      const nextMove = variationMoves.length === 0 ? nextMainlineMove(moves, selectedPly) : null;
      if (nextMove && nextMove.uci === move.uci) {
        setSelectedPly(nextMove.ply);
        setVariationMoves([]);
        return true;
      }

      setVariationMoves((current) => [...current, move]);
      return true;
    },
    [fen, moves, selectedPly, variationMoves.length],
  );

  const handleSquareClick = useCallback(
    (square: string, hasPiece: boolean) => {
      if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          return;
        }
        const moved = playBoardMove(selectedSquare, square);
        if (!moved && hasPiece) setSelectedSquare(square);
        return;
      }

      if (hasPiece) setSelectedSquare(square);
    },
    [selectedSquare, playBoardMove],
  );

  const toggleMarkedSquare = useCallback((square: string) => {
    setMarkedSquares((current) =>
      current.includes(square) ? current.filter((item) => item !== square) : [...current, square],
    );
  }, []);

  const boardOptions = useMemo<ChessboardOptions>(
    () => ({
      id: `game-review-${game?.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
      position: fen,
      boardOrientation,
      allowDragging: true,
      allowDrawingArrows: true,
      showAnimations: false,
      animationDurationInMs: 0,
      clearArrowsOnClick: false,
      clearArrowsOnPositionChange: false,
      arrowOptions: {
        color: "rgba(40,125,100,0.9)",
        secondaryColor: "rgba(56,132,172,0.85)",
        tertiaryColor: "rgba(198,75,71,0.85)",
        arrowLengthReducerDenominator: 8,
        sameTargetArrowLengthReducerDenominator: 4,
        arrowWidthDenominator: 5,
        activeArrowWidthMultiplier: 0.9,
        opacity: 0.7,
        activeOpacity: 0.55,
        arrowStartOffset: 0,
      },
      squareStyles: selectedSquareStyles(
        displayedMove,
        selectedAnnotation,
        selectedSquare,
        markedSquares,
      ),
      arrows: boardArrows,
      onPieceDrop: ({ sourceSquare, targetSquare }) =>
        targetSquare ? playBoardMove(sourceSquare, targetSquare) : false,
      onSquareClick: ({ piece, square }) => handleSquareClick(square, Boolean(piece)),
      onSquareRightClick: ({ square }) => toggleMarkedSquare(square),
    }),
    [
      game?.id,
      fen,
      boardOrientation,
      displayedMove,
      selectedAnnotation,
      selectedSquare,
      markedSquares,
      boardArrows,
      playBoardMove,
      handleSquareClick,
      toggleMarkedSquare,
    ],
  );

  function stopAnalysis() {
    setAnalysisEnabled(false);
    liveEvaluationEngineRef.current?.dispose();
    liveEvaluationEngineRef.current = null;
    analysisRunRef.current += 1;
    analysisEngineRef.current?.dispose();
    analysisEngineRef.current = null;
    setAnalyzeState((current) => ({
      ...current,
      status: "idle",
      message: "Analysis stopped. Completed positions are kept.",
    }));
  }

  async function analyzeGame() {
    if (!moves.length || analyzeState.status === "running" || analysisEngineRef.current) return;
    const run = ++analysisRunRef.current;
    setAnalysisEnabled(true);
    setReviewPanelCollapsed(false);
    liveEvaluationEngineRef.current?.dispose();
    liveEvaluationEngineRef.current = null;
    const fens = [moves[0].before, ...moves.map((move) => move.after)];
    const evaluations: PositionEvaluation[] = [];
    let engine: StockfishClient | null = null;
    let progress = 0;
    setAnalysis({});
    setPositionAnalysis({});
    setAnalyzeState({
      status: "running",
      progress: 0,
      total: fens.length,
      message: "Loading Stockfish NNUE",
    });
    try {
      engine = new StockfishClient();
      analysisEngineRef.current = engine;
      await engine.init();
      if (run !== analysisRunRef.current) return;
      for (let index = 0; index < fens.length; index++) {
        if (run !== analysisRunRef.current) return;
        const label = index === 0 ? "Starting position" : moveLabel(moves[index - 1]);
        const key = `d${reviewDepth}:${fens[index]}`;
        let evaluation = evaluationCacheRef.current.get(key);
        if (!evaluation || evaluation.depth < reviewDepth || evaluation.error) {
          const raw = await engine.evaluateFen(fens[index], {
            depth: reviewDepth,
            timeoutMs: null,
            hardTimeoutMs: null,
            onInfo: (info) => {
              if (run !== analysisRunRef.current) return;
              setAnalyzeState({
                status: "running",
                progress,
                total: fens.length,
                message: `${label} · depth ${info.depth}/${reviewDepth} · position ${index + 1}/${fens.length}`,
              });
            },
          });
          if (run !== analysisRunRef.current) return;
          evaluation = toPositionEvaluation(fens[index], raw);
          evaluationCacheRef.current.set(key, evaluation);
        }
        evaluations[index] = evaluation;
        setPositionAnalysis((current) => ({ ...current, [index]: evaluation! }));
        if (index > 0) {
          const move = moves[index - 1];
          const moveAnalysis = classifyMove({
            move,
            best: evaluations[index - 1],
            after: evaluation,
          });
          setAnalysis((current) => ({ ...current, [move.ply]: moveAnalysis }));
        }
        progress = index + 1;
        setAnalyzeState({
          status: "running",
          progress,
          total: fens.length,
          message: `Analyzed ${progress}/${fens.length} positions · target depth ${reviewDepth}`,
        });
      }
      setAnalyzeState({
        status: "done",
        progress,
        total: fens.length,
        message: `Analysis complete · all ${fens.length} positions analyzed · target depth ${reviewDepth}`,
      });
    } catch (error) {
      if (run !== analysisRunRef.current) return;
      setAnalyzeState({
        status: "error",
        progress,
        total: fens.length,
        message: error instanceof Error ? error.message : "Stockfish analysis failed",
      });
    } finally {
      engine?.dispose();
      if (analysisEngineRef.current === engine) analysisEngineRef.current = null;
    }
  }

  if (!game) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Game not found"
          description="The game review page needs an imported game from this browser profile."
        />
      </div>
    );
  }

  if (moves.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="PGN could not be replayed"
          description="This imported game did not include a complete readable move list."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-4 pb-[52px] sm:px-6 lg:px-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">
            {game.whiteUser} — {game.blackUser}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {game.opening} · {timeFormatLabel(game)} · {game.movesCount} moves ·{" "}
            {formatDate(game.endTime)} ·{" "}
            <span className={resultClass(game.result)}>{game.result}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReviewPanelCollapsed((collapsed) => !collapsed)}
            aria-expanded={!reviewPanelCollapsed}
            aria-controls="game-review-panel"
          >
            {reviewPanelCollapsed ? (
              <PanelRightOpen className="mr-1.5 h-4 w-4" />
            ) : (
              <PanelRightClose className="mr-1.5 h-4 w-4" />
            )}
            {reviewPanelCollapsed ? "Show panel" : "Hide panel"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/app/games">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Games
            </a>
          </Button>
          <Button
            size="sm"
            onClick={analyzeState.status === "running" ? stopAnalysis : analyzeGame}
            className="bg-accent text-accent-foreground hover:bg-accent/90 transition-none"
          >
            {analyzeState.status === "running" ? "Stop analysis" : "Analyze game"}
          </Button>
        </div>
      </header>

      <div
        className={`grid grid-cols-1 items-start gap-5 ${reviewPanelCollapsed ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]"}`}
      >
        <div className="min-w-0 space-y-5">
          <section aria-label="Analysis board">
            <div
              ref={boardFrameRef}
              className={`mx-auto scroll-mt-14 scroll-mb-9 ${boardWidthClass}`}
              style={boardWidthStyle}
            >
              <div className="flex items-stretch gap-2">
                <div className="relative aspect-square min-w-0 flex-1">
                  <ChessBoard options={boardOptions} className="rounded-none shadow-none" />
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 z-10 grid h-5 w-5 touch-none select-none cursor-nwse-resize place-items-center border-0 bg-transparent p-0 text-muted-foreground/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();

                      event.currentTarget.setPointerCapture(event.pointerId);
                      boardResizeRef.current = {
                        pointerId: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        width: boardFrameRef.current?.getBoundingClientRect().width ?? 400,
                      };
                    }}
                    onPointerMove={(event) => {
                      const drag = boardResizeRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      resizeBoard(drag.width + event.clientX - drag.x + event.clientY - drag.y);
                    }}
                    onPointerUp={() => {
                      boardResizeRef.current = null;
                      centerReviewBoard(boardFrameRef.current);
                    }}
                    onPointerCancel={() => {
                      boardResizeRef.current = null;
                    }}
                    onLostPointerCapture={() => {
                      boardResizeRef.current = null;
                    }}
                    onKeyDown={(event) => {
                      const direction =
                        event.key === "ArrowRight" || event.key === "ArrowDown"
                          ? 1
                          : event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? -1
                            : 0;
                      if (direction) {
                        event.preventDefault();
                        resizeBoard(
                          (boardFrameRef.current?.getBoundingClientRect().width ?? 400) +
                            direction * 20,
                        );
                      } else if (event.key === "Home") {
                        event.preventDefault();
                        boardScrollIntentRef.current = true;
                        setBoardWidth(null);
                        centerReviewBoard(boardFrameRef.current);
                      }
                    }}
                    aria-label="Resize board"
                    title="Drag inward or outward to resize the board."
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M5 19 19 5M11 19l8-8M17 19l2-2" />
                    </svg>
                  </button>
                </div>
                <EvaluationBar
                  whiteCp={displayedEvalWhite}
                  depth={displayedEvalDepth}
                  analyzing={isEvaluationBarLoading}
                  orientation={boardOrientation}
                />
              </div>
            </div>

            <div
              className={`mx-auto mt-3 flex items-center gap-2 ${boardWidthClass}`}
              style={boardWidthStyle}
            >
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 transition-none"
                onClick={() => shift(-1)}
                disabled={variationMoves.length === 0 && selectedPly < 0}
                aria-label="Previous move"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 px-3 py-1">
                <div className="truncate font-mono text-xs">
                  {displayedMove ? boardMoveLabel(displayedMove) : "Starting position"}
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {latestVariationMove
                    ? `Sub line from ${selectedMove ? moveLabel(selectedMove) : "start"}`
                    : selectedAnalysis?.bestSan
                      ? `Best: ${selectedAnalysis.bestSan} - ${formatEval(selectedAnalysis.evalBest)}`
                      : `${annotationLabel(selectedAnnotation)} position`}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => shift(1)}
                disabled={variationMoves.length > 0 || selectedPly >= moves.length - 1}
                aria-label="Next move"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 transition-none"
                onClick={flipBoard}
                aria-label="Flip board"
                title="Flip board"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </section>
        </div>

        <aside
          aria-label="Game annotations"
          id="game-review-panel"
          hidden={reviewPanelCollapsed}
          className={`min-w-0 self-start ${reviewPanelCollapsed ? "hidden" : ""}`}
        >
          <h2 className="mb-2 text-sm font-semibold">Moves</h2>
          <div
            ref={notationRef}
            className="overflow-y-auto overscroll-contain border-y border-border"
            style={{ height: Math.max(180, Math.min(420, boardWidthStyle.width - 140)) }}
          >
            {movePairs.map((pair) => (
              <div
                key={pair.moveNumber}
                className="grid grid-cols-[2.25rem_1fr_1fr] items-center even:bg-muted/35"
              >
                <div className="pl-2 text-xs text-muted-foreground">{pair.moveNumber}.</div>
                <MoveCell
                  move={pair.white}
                  analysis={pair.white ? analysis[pair.white.ply] : undefined}
                  active={selectedPly === pair.white?.ply}
                  onClick={() => pair.white && pickMainline(pair.white.ply)}
                  data-ply={pair.white?.ply}
                />
                <MoveCell
                  move={pair.black}
                  analysis={pair.black ? analysis[pair.black.ply] : undefined}
                  active={selectedPly === pair.black?.ply}
                  onClick={() => pair.black && pickMainline(pair.black.ply)}
                  data-ply={pair.black?.ply}
                />
              </div>
            ))}
          </div>
          <div className="space-y-3 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>{displayedMove ? boardMoveLabel(displayedMove) : "Starting position"}</span>
              <span className="text-muted-foreground">
                {selectedAnalysis ? annotationLabel(selectedAnnotation) : ""}
              </span>
            </div>
            {!latestVariationMove && selectedAnalysis?.bestSan && (
              <p className="text-xs">
                Best move: <strong>{selectedAnalysis.bestSan}</strong>
              </p>
            )}
            {!latestVariationMove && selectedIsPlayerMove && selectedCoachInsight && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Why this move?</summary>
                <p className="mt-2 leading-relaxed">{selectedCoachInsight.explanation}</p>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {selectedCoachInsight.advice}
                </p>
              </details>
            )}
            <VariationLine
              moves={variationMoves}
              origin={selectedMove ? moveLabel(selectedMove) : "start"}
              onFocus={focusVariation}
              onDeleteFrom={deleteVariationFrom}
              onDeleteAll={resetVariation}
            />
            <div
              className="border-t border-border pt-3 text-xs text-muted-foreground"
              role="status"
            >
              <div className="flex justify-between gap-2">
                <span>
                  {analyzeState.status === "idle"
                    ? analyzeState.message || "Click Analyze game to review your moves."
                    : analyzeState.message}
                </span>
                {analyzeState.status === "running" && <span>{progressPct}%</span>}
              </div>
              {analyzeState.status === "running" && (
                <div
                  className="mt-2 h-1 bg-muted"
                  role="progressbar"
                  aria-label="Game analysis"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full bg-accent" style={{ width: `${progressPct}%` }} />
                </div>
              )}
              {Object.keys(analysis).length > 0 && (
                <p className="mt-2">
                  {summary.inaccuracy} inaccuracies · {summary.mistake} mistakes · {summary.blunder}{" "}
                  blunders
                </p>
              )}
              <p className="mt-2">Stockfish NNUE · Local analysis</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
