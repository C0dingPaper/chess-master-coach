import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames } from "@/lib/chess/hooks";
import { detectIssues, type DetectedIssue } from "@/lib/chess/stats";
import type { Color } from "@/lib/chess/types";
import { Chess, DEFAULT_POSITION, type Move as ChessMove } from "chess.js";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { ChessBoard, ChessPositionPreview } from "@/components/chess-board";

export const Route = createFileRoute("/app/mistakes")({
  head: () => ({ meta: [{ title: "Mistakes - NeverPay4Chess" }] }),
  component: MistakesPage,
});

const typeColor = (t: DetectedIssue["type"]) =>
  t === "Blunder"
    ? "bg-loss/15 text-loss border-loss/30"
    : t === "Mistake"
      ? "bg-accent/15 text-accent border-accent/30"
      : "bg-draw/15 text-draw border-draw/30";

function countType(issues: DetectedIssue[], type: DetectedIssue["type"]) {
  return issues.filter((issue) => issue.type === type).length;
}

type AnnotationKind = "blunder" | "inaccuracy" | "brilliancy" | "good";

type ReviewMove = {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  before: string;
  after: string;
  annotation: AnnotationKind;
};

function annotationLabel(kind: AnnotationKind) {
  if (kind === "blunder") return "Blunder";
  if (kind === "inaccuracy") return "Inaccuracy";
  if (kind === "brilliancy") return "Brilliancy";
  return "Good";
}

function annotationClass(kind: AnnotationKind, active = false) {
  const base = active ? "ring-1 ring-offset-1 ring-offset-background" : "";
  if (kind === "blunder") return `${base} border-loss/50 bg-loss/20 text-loss ring-loss/70`;
  if (kind === "inaccuracy") return `${base} border-draw/50 bg-draw/20 text-draw ring-draw/70`;
  if (kind === "brilliancy") return `${base} border-sky-200 bg-sky-50 text-sky-700 ring-sky-400/70`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-400/70`;
}

function chooseIssuePly(issue: DetectedIssue, moves: ChessMove[]) {
  if (moves.length === 0) return -1;
  const myParity = issue.game.myColor === "white" ? 0 : 1;
  const lastMyMove = [...moves.keys()].reverse().find((index) => index % 2 === myParity);
  if (issue.type === "Inaccuracy") {
    const target = Math.floor(moves.length * 0.55);
    for (let offset = 0; offset < moves.length; offset++) {
      const left = target - offset;
      if (left >= 0 && left % 2 === myParity) return left;
      const right = target + offset;
      if (right < moves.length && right % 2 === myParity) return right;
    }
  }
  return lastMyMove ?? moves.length - 1;
}

function buildReviewMoves(issue: DetectedIssue): ReviewMove[] {
  try {
    const chess = new Chess();
    chess.loadPgn(issue.game.pgn, { strict: false });
    const moves = chess.history({ verbose: true });
    const issuePly = chooseIssuePly(issue, moves);

    return moves.map((move, index) => {
      let annotation: AnnotationKind = "good";
      if (index === issuePly) {
        annotation = issue.type === "Blunder" ? "blunder" : "inaccuracy";
      } else if (move.san.includes("#")) {
        annotation = "brilliancy";
      }

      return {
        ply: index,
        moveNumber: Math.floor(index / 2) + 1,
        color: move.color === "w" ? "white" : "black",
        san: move.san,
        before: move.before,
        after: move.after,
        annotation,
      };
    });
  } catch {
    return [];
  }
}

function GameReviewDialog({
  issue,
  open,
  onOpenChange,
}: {
  issue: DetectedIssue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const moves = useMemo(() => buildReviewMoves(issue), [issue]);
  const issuePly = useMemo(() => {
    const critical = moves.find((move) => move.annotation === "blunder");
    if (critical) return critical.ply;
    return moves.find((move) => move.annotation === "inaccuracy")?.ply ?? 0;
  }, [moves]);
  const [selectedPly, setSelectedPly] = useState(issuePly);
  const selectedMove = selectedPly >= 0 ? moves[selectedPly] : null;
  const fen = selectedMove?.after ?? DEFAULT_POSITION;
  const movePairs = [];

  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ moveNumber: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] });
  }

  function shift(delta: number) {
    setSelectedPly((current) => Math.max(-1, Math.min(moves.length - 1, current + delta)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="font-display text-2xl">
            {issue.game.opening} vs {issue.game.oppName}
          </DialogTitle>
          <DialogDescription>
            {issue.game.myColor === "white" ? "White" : "Black"} to review - {issue.game.result} -{" "}
            {issue.game.movesCount} moves
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,1fr)]">
          <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div className="mx-auto w-full">
              <ChessBoard
                options={{
                  id: `mistake-review-${issue.game.id}`,
                  position: fen,
                  boardOrientation: issue.game.myColor,
                  allowDragging: false,
                  allowDrawingArrows: true,
                  showNotation: true,
                  animationDurationInMs: 160,
                  boardStyle: { width: "100%", height: "100%" },
                }}
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => shift(-1)}
                disabled={selectedPly < 0}
                aria-label="Previous move"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 rounded-md border border-border/50 bg-background/60 px-3 py-2">
                <div className="truncate font-mono text-xs">
                  {selectedMove
                    ? `${selectedMove.moveNumber}${selectedMove.color === "black" ? "..." : "."} ${selectedMove.san}`
                    : "Starting position"}
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {selectedMove
                    ? annotationLabel(selectedMove.annotation)
                    : "Use the move list to review the game."}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => shift(1)}
                disabled={selectedPly >= moves.length - 1}
                aria-label="Next move"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              {(["blunder", "inaccuracy", "brilliancy", "good"] as AnnotationKind[]).map((kind) => (
                <div key={kind} className={`rounded border px-2 py-1 ${annotationClass(kind)}`}>
                  {annotationLabel(kind)}
                </div>
              ))}
            </div>
          </div>

          <div className="max-h-[65vh] min-h-0 overflow-auto p-5">
            <div className="mb-3 rounded-md border border-border/40 bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">Coach: </span>
              {issue.reason}
            </div>
            <div className="space-y-1">
              {movePairs.map((pair) => (
                <div
                  key={pair.moveNumber}
                  className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/25"
                >
                  <div className="font-mono text-xs text-muted-foreground">{pair.moveNumber}.</div>
                  {[pair.white, pair.black].map((move) =>
                    move ? (
                      <button
                        key={move.ply}
                        type="button"
                        onClick={() => setSelectedPly(move.ply)}
                        className={`min-w-0 rounded border px-2 py-1 text-left font-mono text-xs transition hover:brightness-110 ${annotationClass(
                          move.annotation,
                          selectedPly === move.ply,
                        )}`}
                      >
                        <span className="mr-1 text-[10px] opacity-70">
                          {move.color === "white" ? "W" : "B"}
                        </span>
                        <span>{move.san}</span>
                      </button>
                    ) : (
                      <div key="empty" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const IssuePreview = memo(function IssuePreview({ issue }: { issue: DetectedIssue }) {
  const fen = useMemo(() => {
    const moves = buildReviewMoves(issue);
    return (
      moves.find((move) => move.annotation === "blunder" || move.annotation === "inaccuracy")
        ?.before ?? DEFAULT_POSITION
    );
  }, [issue]);
  return (
    <ChessPositionPreview
      position={fen}
      boardOrientation={issue.game.myColor}
      label={`Position from your game against ${issue.game.oppName}`}
    />
  );
});

function MistakesPage() {
  const conn = useConnection();
  const games = useGames();
  const [reviewIssue, setReviewIssue] = useState<DetectedIssue | null>(null);
  const issues = useMemo(() => detectIssues(games), [games]);

  if (!conn || games.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Import games to detect mistakes"
          description="Find games worth a closer look, replay key moments, and discover what you can do differently."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Learn from your losses"
        title="Every game is a lesson"
        description="Games selected for review from results, game length, and accuracy. Replay a game to find the turning point."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { l: "Blunders", v: countType(issues, "Blunder"), c: "text-loss" },
          { l: "Mistakes", v: countType(issues, "Mistake"), c: "text-accent" },
          { l: "Inaccuracies", v: countType(issues, "Inaccuracy"), c: "text-draw" },
          {
            l: "Reviewed games",
            v: games.filter((g) => g.result === "loss").length,
            c: "text-foreground",
          },
        ].map((s) => (
          <Card key={s.l} className="border-border/60 bg-card p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {s.l}
            </div>
            <div className={`font-display mt-1 text-3xl font-semibold ${s.c}`}>{s.v}</div>
          </Card>
        ))}
      </div>

      {issues.length === 0 ? (
        <Card className="border-border/60 bg-card p-10 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-md bg-win/10 text-win">
            <MessageCircle className="h-5 w-5" />
          </div>
          <h3 className="font-display text-xl font-semibold">No obvious issues detected</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            The heuristic pass did not find short losses, quick mates, or low-accuracy losses in the
            imported set.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <Card
              key={issue.game.id}
              className="border-border bg-card p-4 transition-colors hover:border-accent/30 sm:p-5"
            >
              <div className="flex flex-col items-start gap-5 sm:flex-row">
                <div className="aspect-square w-full max-w-[200px] shrink-0 overflow-hidden rounded-lg border border-border sm:w-36 lg:w-44">
                  <IssuePreview issue={issue} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={`font-mono text-[10px] ${typeColor(issue.type)}`}>
                      {issue.type}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {issue.game.opening} - vs {issue.game.oppName}
                    </span>
                    <span className="ml-auto font-mono text-xs text-loss">
                      {issue.game.movesCount} moves
                    </span>
                  </div>
                  <h4 className="font-display text-lg font-semibold">{issue.reason}</h4>
                  <div className="mt-3 flex items-start gap-2.5 rounded-md border border-border/40 bg-muted/40 p-3">
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div className="text-sm">
                      <span className="text-muted-foreground">Coach: </span>
                      Start by replaying this game and marking the position where the evaluation
                      first felt unstable. That position should become a training card.
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setReviewIssue(issue)}>
                      <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                      Replay game
                    </Button>
                    <Button
                      size="sm"
                      disabled
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      Add to training <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {reviewIssue && (
        <GameReviewDialog
          key={reviewIssue.game.id}
          issue={reviewIssue}
          open={Boolean(reviewIssue)}
          onOpenChange={(open) => {
            if (!open) setReviewIssue(null);
          }}
        />
      )}
    </div>
  );
}
