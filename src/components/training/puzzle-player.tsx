import { useMemo, useState, type CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import { Lightbulb, RotateCcw, ArrowRight, Eye } from "lucide-react";
import { ChessBoard } from "@/components/chess-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createActivePuzzle,
  playPuzzleMove,
  puzzleBoard,
  revealPuzzleMove,
} from "@/lib/training/engine";
import type { ActivePuzzle, Puzzle } from "@/lib/training/types";

export function PuzzlePlayer({
  puzzle,
  active,
  enabled = true,
  onChange,
  onFinish,
}: {
  puzzle: Puzzle;
  active: ActivePuzzle;
  enabled?: boolean;
  onChange: (active: ActivePuzzle, status: string) => void;
  onFinish: (active: ActivePuzzle) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [typedMove, setTypedMove] = useState("");
  const board = useMemo(() => puzzleBoard(puzzle, active), [puzzle, active]);
  const initial = useMemo(() => puzzleBoard(puzzle, createActivePuzzle(puzzle)), [puzzle]);
  const side = initial.turn() === "w" ? "white" : "black";
  const canMove = enabled && !active.completed;
  const solution = useMemo(() => {
    const chess = new Chess(puzzle.fen);
    return puzzle.moves
      .map((move) => chess.move(move).san)
      .slice(1)
      .join("  ");
  }, [puzzle]);

  function play(uci: string) {
    if (!canMove) return false;
    const result = playPuzzleMove(puzzle, active, uci);
    setSelected(null);
    setPromotion(null);
    setHintSquare(null);
    if (result.status === "invalid") {
      setFeedback("That move is not legal. Try another square.");
      return false;
    }
    setFeedback(
      result.status === "wrong"
        ? "Not quite. Look again, or reveal the continuation. This puzzle will return for review."
        : result.status === "complete"
          ? "Solution complete."
          : "Good move. Find your next move.",
    );
    onChange(result.active, result.status);
    return result.status !== "wrong";
  }

  function move(from: string, to: string) {
    if (!canMove) return false;
    const legal = board.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (legal.some((m) => m.promotion)) {
      setPromotion({ from, to });
      return false;
    }
    return play(from + to);
  }

  const squareStyles: Record<string, CSSProperties> = {};
  active.lastMove?.forEach((square) => {
    squareStyles[square] = { backgroundColor: "rgba(207, 188, 89, .36)" };
  });
  if (hintSquare) squareStyles[hintSquare] = { boxShadow: "inset 0 0 0 5px #b1812b" };
  if (selected) {
    squareStyles[selected] = { backgroundColor: "rgba(40, 125, 100, .5)" };
    for (const m of board.moves({ square: selected as Square, verbose: true })) {
      squareStyles[m.to] = {
        backgroundImage: "radial-gradient(circle, rgba(27, 58, 43, .3) 22%, transparent 25%)",
      };
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span
            className={`h-3 w-3 rounded-full border border-foreground/30 ${side === "white" ? "bg-white" : "bg-foreground"}`}
          />
          {side === "white" ? "White" : "Black"} to move
        </span>
        <span className="text-xs text-muted-foreground">Find the full continuation</span>
      </div>
      <div className="relative mx-auto w-full max-w-[540px]">
        <ChessBoard
          options={{
            id: `puzzle-${puzzle.id}`,
            position: board.fen(),
            boardOrientation: side,
            allowDragging: canMove,
            allowDrawingArrows: enabled,
            squareStyles,
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? move(sourceSquare, targetSquare) : false,
            onSquareClick: ({ square }) => {
              if (!canMove) return;
              if (selected === square) {
                setSelected(null);
                return;
              }
              if (selected && board.get(square as Square)?.color !== board.turn()) {
                move(selected, square);
                return;
              }
              setSelected(board.get(square as Square)?.color === board.turn() ? square : null);
            },
          }}
        />
        {!enabled && (
          <div className="absolute inset-0 grid place-items-center rounded-lg bg-background/90 backdrop-blur-sm">
            <p className="font-medium">Training paused</p>
          </div>
        )}
        {promotion && enabled && (
          <div
            role="dialog"
            aria-label="Choose promotion piece"
            className="absolute inset-x-3 top-1/3 rounded-xl border bg-card p-4 shadow-lg"
          >
            <p className="mb-3 text-center font-medium">Promote your pawn</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["q", "Queen"],
                ["r", "Rook"],
                ["b", "Bishop"],
                ["n", "Knight"],
              ].map(([piece, label]) => (
                <Button
                  key={piece}
                  variant="outline"
                  size="sm"
                  onClick={() => play(promotion.from + promotion.to + piece)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button className="mt-2 w-full" variant="ghost" onClick={() => setPromotion(null)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div
        aria-live="polite"
        role="status"
        className={`mt-4 min-h-10 text-sm ${active.failed ? "text-loss" : "text-accent"}`}
      >
        {feedback ||
          (active.failed
            ? "This attempt is marked for review. Finish the line to learn the pattern."
            : "Calculate first, then drag a piece or tap two squares.")}
      </div>
      {active.completed ? (
        <div className="space-y-3 rounded-lg border border-accent/20 bg-accent/5 p-4">
          <p className="font-medium">
            {active.failed ? "A pattern to revisit" : "Well calculated"}
          </p>
          <p className="break-words font-mono text-sm leading-7">{solution}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {puzzle.themes.map((t) => t.replace(/([A-Z])/g, " $1")).join(" · ")} · Rating{" "}
            {puzzle.rating}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!enabled}
              variant="outline"
              onClick={() => {
                setFeedback("Replay the solution. This remains a review attempt.");
                onChange(
                  {
                    ...createActivePuzzle(puzzle, active.kind),
                    failed: true,
                    hinted: active.hinted,
                  },
                  "replay",
                );
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Replay to learn
            </Button>
            <Button disabled={!enabled} onClick={() => onFinish(active)}>
              Next puzzle
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <a
            className="inline-block text-xs text-accent underline underline-offset-4"
            href={`https://lichess.org/training/${puzzle.id}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Lichess
          </a>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canMove}
            variant="outline"
            size="sm"
            onClick={() => {
              setHintSquare(puzzle.moves[active.moveIndex]?.slice(0, 2) ?? null);
              setFeedback(
                "The highlighted piece has the next move. This attempt counts as a review.",
              );
              onChange({ ...active, failed: true, hinted: true }, "hint");
            }}
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            Hint
          </Button>
          <Button
            disabled={!canMove}
            variant="ghost"
            size="sm"
            onClick={() => {
              const result = revealPuzzleMove(puzzle, active);
              setSelected(null);
              setHintSquare(null);
              setFeedback(
                result.status === "complete"
                  ? "Study the solution, then replay it or continue."
                  : "Here is the next move. Try the rest, or reveal another move.",
              );
              onChange(result.active, result.status);
            }}
          >
            <Eye className="mr-2 h-4 w-4" />
            Reveal next move
          </Button>
        </div>
      )}
      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Enter a move with your keyboard</summary>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const test = new Chess(board.fen());
              const m = test.move(typedMove.trim());
              play(m.from + m.to + (m.promotion ?? ""));
              setTypedMove("");
            } catch {
              setFeedback("Enter a legal move, such as Nf3 or g1f3.");
            }
          }}
        >
          <Input
            aria-label="Chess move in SAN or UCI notation"
            placeholder="Nf3 or g1f3"
            value={typedMove}
            onChange={(e) => setTypedMove(e.target.value)}
            disabled={!canMove}
            autoComplete="off"
          />
          <Button type="submit" disabled={!canMove || !typedMove.trim()} variant="outline">
            Play
          </Button>
        </form>
      </details>
    </div>
  );
}
