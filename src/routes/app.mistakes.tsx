import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mistakes } from "@/lib/mock-data";
import { AlertTriangle, MessageCircle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/app/mistakes")({
  head: () => ({ meta: [{ title: "Mistakes · NeverPay4Chess" }] }),
  component: MistakesPage,
});

const typeColor = (t: string) =>
  t === "Blunder" ? "bg-loss/15 text-loss border-loss/30" :
  t === "Mistake" ? "bg-accent/15 text-accent border-accent/30" :
  "bg-draw/15 text-draw border-draw/30";

function MistakesPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Learn from your losses"
        title="Mistakes & blunders"
        description="Every inaccuracy explained in plain English, with the move you should have played."
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Blunders", v: 12, c: "text-loss" },
          { l: "Mistakes", v: 28, c: "text-accent" },
          { l: "Inaccuracies", v: 64, c: "text-draw" },
          { l: "Avg. eval drop", v: "-1.8", c: "text-foreground" },
        ].map((s) => (
          <Card key={s.l} className="p-4 border-border/60 bg-card/40">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{s.l}</div>
            <div className={`font-display text-3xl font-semibold mt-1 ${s.c}`}>{s.v}</div>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {mistakes.map((m) => (
          <Card key={m.id} className="p-5 border-border/60 bg-card/40 hover:border-accent/30 transition">
            <div className="flex items-start gap-4">
              <div className="bg-board aspect-square w-24 md:w-32 rounded-md shadow-elegant grain shrink-0 relative overflow-hidden grid place-items-center">
                <AlertTriangle className="h-6 w-6 text-loss/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge className={`font-mono text-[10px] ${typeColor(m.type)}`}>{m.type}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">Move {m.move} · {m.game}</span>
                  <span className="font-mono text-xs text-loss ml-auto">{m.evalDrop}</span>
                </div>
                <h4 className="font-display text-lg font-semibold">{m.description}</h4>
                <div className="mt-3 p-3 rounded-md bg-muted/40 border border-border/40 flex items-start gap-2.5">
                  <MessageCircle className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Coach: </span>
                    Your move loses tempo and weakens the dark squares. <span className="text-foreground font-medium">{m.betterMove}</span> would have kept your structure intact and forced the trade on your terms.
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="sm">Replay position</Button>
                  <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    Add to training <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
