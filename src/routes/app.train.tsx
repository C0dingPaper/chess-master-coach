import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, usePinned } from "@/lib/chess/hooks";
import { putPinned } from "@/lib/chess/storage";
import { isDue, schedule, type Quality } from "@/lib/chess/srs";
import { Brain, Check, Clock, X } from "lucide-react";
import { useMemo, useState } from "react";
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
              The SRS scheduler is ready. Add pinned positions from repertoire analysis to start
              drilling real positions.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Spaced repetition"
        title="Train your repertoire"
        description="Review pinned positions on an SM-2 inspired schedule."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card className="border-border/60 bg-card/40 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {due.length > 0 ? `Position 1 of ${due.length}` : formatDue(current.due)}
                </div>
                <h3 className="font-display mt-1 text-xl font-semibold">{current.label}</h3>
              </div>
              <Badge due={isDue(current)} />
            </div>
            <div className="bg-board grain relative aspect-square overflow-hidden rounded-lg shadow-elegant">
              <div className="absolute inset-0 grid place-items-center">
                <div className="select-none font-display text-7xl text-background/35">
                  {showAnswer ? current.myMove : "?"}
                </div>
              </div>
              <div className="absolute bottom-3 left-3 right-3 rounded-md bg-background/85 p-3 backdrop-blur">
                <div className="font-mono text-xs text-muted-foreground">FEN</div>
                <div className="mt-1 truncate font-mono text-xs">{current.fen}</div>
              </div>
            </div>
            {current.note && (
              <div className="mt-4 rounded-md border border-border/40 bg-muted/30 p-3 text-sm text-muted-foreground">
                {current.note}
              </div>
            )}
            <div className="mt-5">
              {!showAnswer ? (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => void grade("again")}
                    disabled={saving}
                  >
                    <X className="mr-2 h-4 w-4 text-loss" /> Don't know
                  </Button>
                  <Button variant="outline" className="flex-1" disabled>
                    Hint
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
                      {q}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card className="border-border/60 bg-card/40 p-5">
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

          <Card className="border-border/60 bg-card/40 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              <h3 className="font-display text-lg font-semibold">Next card</h3>
            </div>
            <div className="font-display text-2xl font-semibold">{formatDue(current.due)}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Ease {current.ease.toFixed(2)} - interval {current.interval}d - reps {current.reps}
            </div>
          </Card>

          <Card className="border-border/60 bg-card/40 p-5">
            <h3 className="font-display mb-3 text-lg font-semibold">Coach says</h3>
            <p className="text-sm italic text-muted-foreground">
              Keep the queue small and concrete. The best cards are positions where you know whose
              move it is and exactly which move you are committing to play.
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
