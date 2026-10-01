import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyConnect } from "@/components/empty-connect";
import { ChessBoard } from "@/components/chess-board";
import { useConnection, usePinned } from "@/lib/chess/hooks";
import { putPinned } from "@/lib/chess/storage";
import { isDue, schedule, type Quality } from "@/lib/chess/srs";
import { Brain, Check, Clock, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";

export const Route = createFileRoute("/app/train")({
  head: () => ({ meta: [{ title: "Train - NeverPay4Chess" }] }),
  component: TrainPage,
});

function formatDue(ms: number) {
  const delta = ms - Date.now();
  if (delta <= 0) return "Due now";
  const minutes = Math.ceil(delta / 60000);
  if (minutes < 60) return `Due in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `Due in ${hours}h`;
  return `Due in ${Math.ceil(hours / 24)}d`;
}

function TrainPage() {
  const conn = useConnection();
  const pinned = usePinned();
  const [showAnswer, setShowAnswer] = useState(false);
  const [saving, setSaving] = useState(false);
  const sorted = useMemo(() => [...pinned].sort((a, b) => a.due - b.due), [pinned]);
  const due = sorted.filter(isDue);
  const current = due[0] ?? sorted[0];
  const mastered = pinned.filter((p) => p.reps >= 3).length;
  const learning = pinned.filter((p) => p.reps > 0 && p.reps < 3).length;
  const answer = useMemo(() => {
    if (!current) return null;
    try {
      const chess = new Chess(current.fen);
      const move = chess.move(current.myMove);
      return { position: chess.fen(), from: move.from, to: move.to, san: move.san };
    } catch {
      return null;
    }
  }, [current]);
  const sideToMove = current?.fen.split(" ")[1] === "b" ? "black" : "white";

  async function grade(q: Quality) {
    if (!current) return;
    setSaving(true);
    try {
      await putPinned(schedule(current, q));
      setShowAnswer(false);
      toast.success("Training card updated");
    } finally {
      setSaving(false);
    }
  }

  if (!conn) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Connect before training"
          description="Training cards are based on positions from your repertoire and imported games."
        />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <PageHeader
          eyebrow="Spaced repetition"
          title="Train your repertoire"
          description="Find the right move in critical positions. Cards you miss come back sooner."
        />
        <Card className="grid min-h-[280px] place-items-center border-dashed border-border/60 bg-card/30 p-8 text-center">
          <div>
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-md bg-accent/10 text-accent">
              <Brain className="h-5 w-5" />
            </div>
            <h3 className="font-display text-xl font-semibold">No training cards yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Your pinned positions will appear here. Revisit the moves that matter and build
              confidence one position at a time.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Spaced repetition"
        title="Train your repertoire"
        description="A little focused practice, a stronger next game. Review your saved positions."
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(270px,1fr)]">
        <div className="min-w-0">
          <Card className="border-border bg-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {due.length > 0 ? `Position 1 of ${due.length}` : formatDue(current.due)}
                </div>
                <h3 className="font-display mt-1 text-xl font-semibold">{current.label}</h3>
              </div>
              <Badge due={isDue(current)} />
            </div>
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className={`h-3 w-3 rounded-full border border-foreground/30 ${sideToMove === "white" ? "bg-white" : "bg-foreground"}`}
              />
              <span className="capitalize">{sideToMove} to move</span>
              <span className="ml-auto text-xs">Find your best continuation</span>
            </div>
            <ChessBoard
              options={{
                id: `training-${current.id}`,
                position: showAnswer && answer ? answer.position : current.fen,
                boardOrientation: sideToMove,
                allowDrawingArrows: true,
                arrows:
                  showAnswer && answer
                    ? [
                        {
                          startSquare: answer.from,
                          endSquare: answer.to,
                          color: "rgba(40,125,100,0.85)",
                        },
                      ]
                    : [],
              }}
            />
            {showAnswer && (
              <div className="mt-4 rounded-lg border border-accent/20 bg-accent/5 p-4">
                <p className="text-xs font-medium text-accent">Your continuation</p>
                <p className="mt-1 font-mono text-2xl font-semibold">
                  {answer?.san ?? current.myMove}
                </p>
                {current.note && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {current.note}
                  </p>
                )}
              </div>
            )}
            <div className="mt-5">
              {!showAnswer ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => void grade("again")}
                    disabled={saving}
                  >
                    <X className="mr-2 h-4 w-4 text-loss" /> Don't know
                  </Button>
                  <Button
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                    onClick={() => setShowAnswer(true)}
                  >
                    <Check className="mr-2 h-4 w-4" /> Show answer
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {(["again", "hard", "good", "easy"] as Quality[]).map((q) => (
                    <Button
                      key={q}
                      variant={q === "good" ? "default" : "outline"}
                      onClick={() => void grade(q)}
                      disabled={saving}
                      className={
                        q === "good" ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""
                      }
                    >
                      {q.charAt(0).toUpperCase() + q.slice(1)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/60 bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-accent" />
              <h3 className="font-display text-lg font-semibold">Today's session</h3>
            </div>
            <div className="space-y-3">
              {[
                { l: "Due now", v: due.length, c: "text-accent" },
                { l: "Learning", v: learning, c: "" },
                { l: "Mastered", v: mastered, c: "text-win" },
              ].map((s) => (
                <div key={s.l} className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{s.l}</span>
                  <span className={`font-display text-2xl font-semibold ${s.c}`}>{s.v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-border/60 bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              <h3 className="font-display text-lg font-semibold">Next card</h3>
            </div>
            <div className="font-display text-2xl font-semibold">{formatDue(current.due)}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Reviewed {current.reps} times · {current.interval}-day review interval
            </div>
          </Card>

          <Card className="border-border/60 bg-card p-5">
            <h3 className="font-display mb-3 text-lg font-semibold">Coach says</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Take a moment to look for checks, captures, and threats. Picture your move before
              revealing the answer, then rate how easily it came to you.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Badge({ due }: { due: boolean }) {
  return (
    <span className="rounded border border-accent/30 bg-accent/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-accent">
      {due ? "Due" : "Queued"}
    </span>
  );
}
