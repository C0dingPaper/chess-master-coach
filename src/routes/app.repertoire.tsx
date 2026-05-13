import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, usePinned, useRepertoire } from "@/lib/chess/hooks";
import { BookmarkCheck, Plus, StickyNote } from "lucide-react";

export const Route = createFileRoute("/app/repertoire")({
  head: () => ({ meta: [{ title: "Repertoire - NeverPay4Chess" }] }),
  component: RepertoirePage,
});

function RepertoirePage() {
  const conn = useConnection();
  const repertoires = useRepertoire();
  const pinned = usePinned();

  if (!conn) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Connect before building a repertoire"
          description="Imported games give the repertoire builder context about which openings you actually face."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Build & curate"
        title="Your repertoire"
        description="Saved moves, labels, and notes from your personal opening book."
        actions={
          <Button disabled className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="mr-1.5 h-4 w-4" /> New line
          </Button>
        }
      />

      {repertoires.length === 0 ? (
        <Card className="grid min-h-[260px] place-items-center border-dashed border-border/60 bg-card/30 p-8 text-center">
          <div>
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-md border border-dashed border-border">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-display text-xl font-medium">No repertoire lines saved yet</div>
            <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              The storage layer is ready. The next step is adding a save action from the opening
              tree so selected FENs and move choices can become repertoire lines.
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repertoires.map((r) => (
            <Card
              key={r.id}
              className="group border-border/60 bg-card/40 p-5 transition hover:border-accent/40"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-muted font-display text-lg uppercase">
                  {r.color.charAt(0)}
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {r.eco || "ECO"}
                </Badge>
              </div>
              <h3 className="font-display text-xl font-semibold">{r.name}</h3>
              <div className="mt-0.5 text-xs capitalize text-muted-foreground">As {r.color}</div>

              <div className="mt-4 rounded-md border border-border/40 bg-muted/30 p-3 font-mono text-xs">
                {r.pgn}
              </div>

              {r.note && (
                <div className="mt-4 flex gap-2 rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="italic">{r.note}</span>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" disabled>
                  Edit line
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled
                >
                  Train
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8 border-border/60 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookmarkCheck className="h-4 w-4 text-accent" />
          <h3 className="font-display text-lg font-semibold">Pinned positions</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Critical positions marked for spaced repetition.
        </p>
        {pinned.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No pinned positions yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {pinned.map((p) => (
              <div
                key={p.id}
                className="bg-board grain relative aspect-square overflow-hidden rounded-md shadow-elegant"
              >
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-background/95 to-transparent p-2">
                  <div className="truncate font-mono text-[10px]">{p.label}</div>
                  <div className="truncate font-mono text-[10px] text-accent">{p.myMove}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
