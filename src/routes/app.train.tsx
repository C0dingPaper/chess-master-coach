import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Check, X, Clock } from "lucide-react";

export const Route = createFileRoute("/app/train")({
  head: () => ({ meta: [{ title: "Train · NeverPay4Chess" }] }),
  component: TrainPage,
});

function TrainPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Spaced repetition"
        title="Train your repertoire"
        description="Find the right move in critical positions. Cards you miss come back sooner."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Card className="p-6 border-border/60 bg-card/40">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Position 3 of 8</div>
                <h3 className="font-display text-xl font-semibold mt-1">Italian Game · Black to move</h3>
              </div>
              <Badge />
            </div>
            <div className="bg-board aspect-square rounded-lg shadow-elegant grain relative overflow-hidden">
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-7xl opacity-25 font-display">♟</div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button variant="outline" className="flex-1">
                <X className="h-4 w-4 mr-2 text-loss" /> Don't know
              </Button>
              <Button variant="outline" className="flex-1">
                Hint
              </Button>
              <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">
                <Check className="h-4 w-4 mr-2" /> Show answer
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 border-border/60 bg-card/40">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-accent" />
              <h3 className="font-display text-lg font-semibold">Today's session</h3>
            </div>
            <div className="space-y-3">
              {[
                { l: "Due now", v: 8, c: "text-accent" },
                { l: "Learning", v: 14, c: "" },
                { l: "Mastered", v: 47, c: "text-win" },
              ].map((s) => (
                <div key={s.l} className="flex justify-between items-baseline">
                  <span className="text-sm text-muted-foreground">{s.l}</span>
                  <span className={`font-display text-2xl font-semibold ${s.c}`}>{s.v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 border-border/60 bg-card/40">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-accent" />
              <h3 className="font-display text-lg font-semibold">Streak</h3>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className={`h-8 flex-1 rounded ${i < 11 ? "bg-accent/80" : "bg-muted"}`} />
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">11 days in a row · longest streak 18</div>
          </Card>

          <Card className="p-5 border-border/60 bg-card/40">
            <h3 className="font-display text-lg font-semibold mb-3">Coach says</h3>
            <p className="text-sm text-muted-foreground italic">
              "You've mastered the main Italian lines. Time to drill the Two Knights Defense — Black plays it 23% of the time against you."
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Badge() {
  return (
    <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-accent/10 text-accent border border-accent/30">
      ★ Critical
    </span>
  );
}
