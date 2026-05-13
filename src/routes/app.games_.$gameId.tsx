import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
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
import {
  StockfishClient,
  evaluationToCentipawns,
  type EngineEvaluation,
} from "@/lib/chess/stockfish";
import type { Color, StoredGame } from "@/lib/chess/types";
import { Chess, DEFAULT_POSITION, type Move as ChessMove } from "chess.js";
import {
  ArrowLeft,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Loader2,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";

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
};

type AnalyzeState = {
  status: "idle" | "running" | "done" | "error";
  progress: number;
  message: string;
};

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

function resultDot(result: StoredGame["result"]) {
  if (result === "win") return "bg-win";
  if (result === "loss") return "bg-loss";
  return "bg-draw";
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

function annotationClass(kind: AnnotationKind, active = false) {
  const focus = active ? "ring-1 ring-offset-1 ring-offset-background" : "";
  if (kind === "brilliancy")
    return `${focus} border-blue-400/50 bg-blue-500/20 text-blue-100 ring-blue-400/70`;
  if (kind === "good")
    return `${focus} border-cyan-300/45 bg-cyan-400/10 text-cyan-100 ring-cyan-300/70`;
  if (kind === "inaccuracy")
    return `${focus} border-yellow-300/45 bg-yellow-400/15 text-yellow-100 ring-yellow-300/70`;
  if (kind === "mistake")
    return `${focus} border-orange-300/45 bg-orange-500/15 text-orange-100 ring-orange-300/70`;
  if (kind === "blunder") return `${focus} border-loss/50 bg-loss/20 text-loss ring-loss/70`;
  if (kind === "test") return `${focus} border-accent/45 bg-accent/15 text-accent ring-accent/70`;
  return `${focus} border-border/50 bg-muted/30 text-muted-foreground ring-border/70`;
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
  const evalAfterForMover = afterEval == null ? null : -afterEval;
  const loss =
    bestEval == null || evalAfterForMover == null
      ? null
      : Math.max(0, bestEval - evalAfterForMover);
  const isBest = Boolean(best.bestMove && move.uci === best.bestMove.toLowerCase());
  const bestSan = sanFromUci(move.before, best.bestMove);

  let annotation: AnnotationKind = "good";
  if (loss == null) annotation = "good";
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
) {
  const styles: Record<string, React.CSSProperties> = {};
  if (!move && !selectedSquare) return styles;
  const color = annotationColor(annotation);
  if (move) {
    styles[move.from] = {
      background: `radial-gradient(circle, ${color} 0%, ${color} 34%, transparent 36%)`,
    };
    styles[move.to] = {
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
          className={`rounded-md border px-2.5 py-1.5 text-left font-mono text-xs transition hover:brightness-110 ${annotationClass(
            "test",
            active,
          )}`}
        >
          <span className="mr-1 text-[10px] opacity-70">
            {move.moveNumber}
            {move.color === "black" ? "..." : "."}
          </span>
          {move.san}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel className="font-mono text-xs">Sub move {index + 1}</ContextMenuLabel>
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
  onFocus,
  onDeleteFrom,
  onDeleteAll,
}: {
  moves: VariationMove[];
  onFocus: (index: number) => void;
  onDeleteFrom: (index: number) => void;
  onDeleteAll: () => void;
}) {
  if (moves.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-accent/30 bg-accent/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-accent">Sub moves</div>
        <div className="text-[11px] text-muted-foreground">Right-click a move to delete</div>
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

  return (
    <button
      type="button"
      onClick={onClick}
      data-ply={dataPly}
      className={`min-w-0 rounded-md border px-2 py-1.5 text-left transition hover:brightness-110 ${annotationClass(
        annotation,
        active,
      )}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-semibold">{move.san}</span>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest">
          {annotation === "pending" ? "..." : annotationLabel(annotation).slice(0, 4)}
        </span>
      </div>
      {analysis && (
        <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] opacity-80">
          <span>{formatEval(analysis.evalAfter)}</span>
          <span>{analysis.loss == null ? "0" : `-${Math.round(analysis.loss)}`}</span>
        </div>
      )}
    </button>
  );
}

function GameReviewPage() {
  const { gameId } = Route.useParams();
  const decodedGameId = decodeURIComponent(gameId);
  const isClient = useIsClient();
  const games = useGames();
  const game = games.find((item) => item.id === decodedGameId);
  const moves = useMemo(() => (game ? buildReviewMoves(game) : []), [game]);
  const notationRef = useRef<HTMLDivElement>(null);
  const [selectedPly, setSelectedPly] = useState(0);
  const [boardZoom, setBoardZoom] = useState(86);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [variationMoves, setVariationMoves] = useState<VariationMove[]>([]);
  const [analysis, setAnalysis] = useState<Record<number, MoveAnalysis>>({});
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>({
    status: "idle",
    progress: 0,
    message: "Ready",
  });

  const selectedMove = selectedPly >= 0 ? (moves[selectedPly] ?? null) : null;
  const selectedAnalysis = selectedMove ? analysis[selectedMove.ply] : undefined;
  const latestVariationMove = variationMoves[variationMoves.length - 1] ?? null;
  const displayedMove = latestVariationMove ?? selectedMove;
  const selectedAnnotation: AnnotationKind = latestVariationMove
    ? "test"
    : (selectedAnalysis?.annotation ?? "pending");
  const fen = latestVariationMove?.after ?? selectedMove?.after ?? DEFAULT_POSITION;
  const progressPct = moves.length ? Math.round((analyzeState.progress / moves.length) * 100) : 0;
  const summary = summarizeAnalysis(analysis);
  const movePairs = [];

  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ moveNumber: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] });
  }

  useEffect(() => {
    const active = notationRef.current?.querySelector(`[data-ply="${selectedPly}"]`);
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPly]);

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

  function playBoardMove(from: string, to: string) {
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
  }

  function handleSquareClick(square: string, hasPiece: boolean) {
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
  }

  async function analyzeGame() {
    if (!moves.length || analyzeState.status === "running") return;
    let engine: StockfishClient | null = null;
    setAnalysis({});
    setAnalyzeState({ status: "running", progress: 0, message: "Starting Stockfish" });

    try {
      engine = new StockfishClient();
      for (const move of moves) {
        setAnalyzeState({
          status: "running",
          progress: move.ply,
          message: `Analyzing ${moveLabel(move)}`,
        });
        const best = await engine.evaluateFen(move.before);
        const after = await engine.evaluateFen(move.after);
        const moveAnalysis = classifyMove({ move, best, after });
        setAnalysis((current) => ({ ...current, [move.ply]: moveAnalysis }));
        setAnalyzeState({
          status: "running",
          progress: move.ply + 1,
          message: `Analyzed ${moveLabel(move)}`,
        });
      }
      setAnalyzeState({ status: "done", progress: moves.length, message: "Analysis complete" });
    } catch (error) {
      setAnalyzeState({
        status: "error",
        progress: 0,
        message: error instanceof Error ? error.message : "Stockfish analysis failed",
      });
    } finally {
      engine?.dispose();
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
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Engine review"
        title={`${game.myColor === "white" ? game.whiteUser : game.blackUser} vs ${game.oppName}`}
        description={`${game.opening} - ${game.eco} - ${formatDate(game.endTime)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/app/games">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Games
              </a>
            </Button>
            <Button
              size="sm"
              onClick={analyzeGame}
              disabled={analyzeState.status === "running"}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {analyzeState.status === "running" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <BrainCircuit className="mr-1.5 h-4 w-4" />
              )}
              Analyze
            </Button>
          </div>
        }
      />

      <div className="mb-8 grid gap-px overflow-hidden rounded-md border border-border/60 bg-border/60 md:grid-cols-5">
        {[
          { label: "Result", value: game.result, className: resultClass(game.result) },
          { label: "Color", value: game.myColor },
          { label: "Opponent", value: `${game.oppName || "Unknown"} ${game.oppRating ?? ""}` },
          { label: "Time", value: game.timeControl || "unknown" },
          { label: "Moves", value: String(game.movesCount) },
        ].map((item) => (
          <div key={item.label} className="bg-card/95 p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {item.label}
            </div>
            <div className={`mt-1 truncate font-mono text-sm capitalize ${item.className ?? ""}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(320px,500px)_1fr]">
        <div className="space-y-5">
          <Card className="border-border/60 bg-card/40 p-4">
            <div className="mb-4 flex items-center gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2">
              <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Slider
                value={[boardZoom]}
                min={68}
                max={100}
                step={4}
                onValueChange={(value) => setBoardZoom(value[0] ?? 86)}
                aria-label="Board size"
                className="min-w-0 flex-1"
              />
              <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Badge variant="outline" className="w-14 justify-center font-mono text-[10px]">
                {boardZoom}%
              </Badge>
            </div>
            <div
              className="mx-auto transition-[max-width] duration-200"
              style={{ maxWidth: `${Math.round(520 * (boardZoom / 100))}px` }}
            >
              <div className="aspect-square overflow-hidden rounded-md border border-border/60 bg-muted shadow-elegant">
                {isClient ? (
                  <Chessboard
                    options={{
                      id: `game-review-${game.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
                      position: fen,
                      boardOrientation: game.myColor,
                      allowDragging: true,
                      allowDrawingArrows: false,
                      showNotation: true,
                      animationDurationInMs: 160,
                      darkSquareStyle: { backgroundColor: "oklch(0.45 0.05 70)" },
                      lightSquareStyle: { backgroundColor: "oklch(0.88 0.04 85)" },
                      squareStyles: selectedSquareStyles(
                        displayedMove,
                        selectedAnnotation,
                        selectedSquare,
                      ),
                      arrows: displayedMove
                        ? [
                            {
                              startSquare: displayedMove.from,
                              endSquare: displayedMove.to,
                              color: annotationColor(selectedAnnotation),
                            },
                          ]
                        : [],
                      onPieceDrop: ({ sourceSquare, targetSquare }) =>
                        targetSquare ? playBoardMove(sourceSquare, targetSquare) : false,
                      onSquareClick: ({ piece, square }) =>
                        handleSquareClick(square, Boolean(piece)),
                      boardStyle: { width: "100%", height: "100%" },
                    }}
                  />
                ) : (
                  <div className="bg-board h-full w-full" />
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => shift(-1)}
                disabled={variationMoves.length === 0 && selectedPly < 0}
                aria-label="Previous move"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 rounded-md border border-border/50 bg-background/60 px-3 py-2">
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
            </div>

            <VariationLine
              moves={variationMoves}
              onFocus={focusVariation}
              onDeleteFrom={deleteVariationFrom}
              onDeleteAll={resetVariation}
            />
          </Card>

          <Card className="border-border/60 bg-card/40 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Stockfish
                </div>
                <div className="mt-1 text-sm">{analyzeState.message}</div>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {progressPct}%
              </Badge>
            </div>
            <Progress value={progressPct} className="h-2" />
            <div className="mt-5 grid grid-cols-5 gap-2 text-center">
              {[
                ["brilliancy", summary.brilliancy],
                ["good", summary.good],
                ["inaccuracy", summary.inaccuracy],
                ["mistake", summary.mistake],
                ["blunder", summary.blunder],
              ].map(([kind, count]) => (
                <div
                  key={kind}
                  className={`rounded-md border px-2 py-2 ${annotationClass(kind as AnnotationKind)}`}
                >
                  <div className="font-display text-lg font-semibold">{count}</div>
                  <div className="truncate font-mono text-[9px] uppercase">
                    {annotationLabel(kind as AnnotationKind)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="self-start border-border/60 bg-card/40">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Annotated game</h2>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${resultDot(game.result)}`} />
                <span>{game.whiteUser}</span>
                <CircleStop className="h-3 w-3" />
                <span>{game.blackUser}</span>
              </div>
            </div>
            {Object.keys(analysis).length > 0 && (
              <Badge className="border-accent/30 bg-accent/15 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/15">
                Engine
              </Badge>
            )}
          </div>

          <div className="border-b border-border/60 bg-background/20 px-4 py-2">
            <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Move window</span>
              <span>Scroll to browse</span>
            </div>
          </div>

          <div
            ref={notationRef}
            className="h-[18rem] overflow-y-auto p-3 md:h-[20rem] xl:h-[22rem]"
          >
            <div className="mb-2 grid grid-cols-[2.75rem_1fr_1fr] gap-2 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>#</span>
              <span>White</span>
              <span>Black</span>
            </div>
            <div className="space-y-1">
              {movePairs.map((pair) => (
                <div
                  key={pair.moveNumber}
                  className="grid grid-cols-[2.75rem_1fr_1fr] items-stretch gap-2 rounded-md px-2 py-1 hover:bg-muted/20"
                >
                  <div className="pt-2 font-mono text-xs text-muted-foreground">
                    {pair.moveNumber}.
                  </div>
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
          </div>

          <div className="border-t border-border/60 p-4">
            <div className={`rounded-md border p-3 ${annotationClass(selectedAnnotation, true)}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span className="font-display text-lg font-semibold">
                      {annotationLabel(selectedAnnotation)}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs">
                    {displayedMove ? boardMoveLabel(displayedMove) : "Start"}
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono text-xs">
                  <div>
                    {!latestVariationMove && selectedAnalysis
                      ? formatEval(selectedAnalysis.evalAfter)
                      : "N/A"}
                  </div>
                  <div className="mt-1 opacity-70">
                    {latestVariationMove || selectedAnalysis?.loss == null
                      ? "0 cp"
                      : `${Math.round(selectedAnalysis.loss)} cp`}
                  </div>
                </div>
              </div>
              {!latestVariationMove && selectedAnalysis?.bestSan && (
                <div className="mt-3 rounded border border-background/30 bg-background/20 px-3 py-2 font-mono text-xs">
                  Best move: {selectedAnalysis.bestSan}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
