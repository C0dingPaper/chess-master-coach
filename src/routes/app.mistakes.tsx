import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames } from "@/lib/chess/hooks";
import { detectIssues, type DetectedIssue } from "@/lib/chess/stats";
import { AlertTriangle, ArrowRight, MessageCircle } from "lucide-react";

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

function MistakesPage() {
  const conn = useConnection();
  const games = useGames();

  if (!conn || games.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Import games to detect mistakes"
          description="The current mistake queue uses practical heuristics until engine analysis is added: short losses, quick mates, and low-accuracy games."
        />
      </div>
    );
  }

  const issues = detectIssues(games);

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Learn from your losses"
        title="Mistakes & blunders"
        description="A first-pass review queue built from your imported games. Engine-level move explanations can build on this later."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
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
          <Card key={s.l} className="border-border/60 bg-card/40 p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {s.l}
            </div>
            <div className={`font-display mt-1 text-3xl font-semibold ${s.c}`}>{s.v}</div>
          </Card>
        ))}
      </div>

      {issues.length === 0 ? (
        <Card className="border-border/60 bg-card/40 p-10 text-center">
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
              className="border-border/60 bg-card/40 p-5 transition hover:border-accent/30"
            >
              <div className="flex items-start gap-4">
                <div className="bg-board grain relative grid aspect-square w-24 shrink-0 place-items-center overflow-hidden rounded-md shadow-elegant md:w-32">
                  <AlertTriangle className="h-6 w-6 text-loss/70" />
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
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={issue.game.url} target="_blank" rel="noreferrer">
                        Replay game
                      </a>
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
    </div>
  );
}
