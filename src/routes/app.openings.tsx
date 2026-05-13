import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames } from "@/lib/chess/hooks";
import { buildOpeningTree, serializeTree, type SerializedNode } from "@/lib/chess/opening-tree";
import type { Color } from "@/lib/chess/types";
import { BookmarkCheck, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/app/openings")({
  head: () => ({ meta: [{ title: "Opening Tree - NeverPay4Chess" }] }),
  component: OpeningsPage,
});

function pct(part: number, total: number) {
  return total ? (part / total) * 100 : 0;
}

function NodeRow({
  node,
  depth = 0,
  onPick,
}: {
  node: SerializedNode;
  depth?: number;
  onPick: (n: SerializedNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const winRate = node.count ? Math.round((node.wins / node.count) * 100) : 0;
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        onClick={() => {
          onPick(node);
          if (hasChildren) setOpen(!open);
        }}
        className="group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 transition hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 18 + 12}px` }}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition ${
            hasChildren ? "" : "opacity-0"
          } ${open ? "rotate-90" : ""}`}
        />
        <span className="w-32 truncate font-mono text-sm font-medium">{node.san}</span>
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-1.5 max-w-xs flex-1 overflow-hidden rounded-full bg-muted">
            <div className="bg-win" style={{ width: `${pct(node.wins, node.count)}%` }} />
            <div className="bg-draw" style={{ width: `${pct(node.draws, node.count)}%` }} />
            <div className="bg-loss" style={{ width: `${pct(node.losses, node.count)}%` }} />
          </div>
          <span
            className={`w-10 text-right font-mono text-xs ${
              winRate >= 60 ? "text-win" : winRate >= 40 ? "text-foreground" : "text-loss"
            }`}
          >
            {winRate}%
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {node.count}
        </Badge>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <NodeRow key={`${c.san}-${c.fen}`} node={c} depth={depth + 1} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniBoard({ node, color }: { node: SerializedNode; color: Color }) {
  return (
    <div className="bg-board grain relative aspect-square overflow-hidden rounded-md shadow-elegant">
      <div className="absolute inset-0 grid place-items-center">
        <div className="select-none font-display text-6xl text-background/45">
          {color === "white" ? "W" : "B"}
        </div>
      </div>
      <div className="absolute bottom-2 left-2 right-2 rounded bg-background/85 px-3 py-2 font-mono text-xs backdrop-blur">
        <div>
          Position after <span className="text-accent">{node.san}</span>
        </div>
        <div className="mt-1 truncate text-[10px] text-muted-foreground">{node.fen}</div>
      </div>
    </div>
  );
}

function OpeningsPage() {
  const conn = useConnection();
  const games = useGames();
  const [color, setColor] = useState<Color>("white");
  const [picked, setPicked] = useState<SerializedNode | null>(null);
  const tree = useMemo(() => serializeTree(buildOpeningTree(games, color)), [color, games]);
  const selected = picked && picked.count > 0 ? picked : (tree.children[0] ?? tree);

  if (!conn || games.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Import games to build your opening tree"
          description="After import, this page groups your actual games by move so you can see frequency, win rate, and weak lines."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Personal opening tree"
        title="Your repertoire, by the numbers"
        description={`Built from your imported ${conn.platform} games. Switch color to inspect the lines you actually play.`}
        actions={
          <div className="flex rounded-md border border-border bg-muted/30 p-1">
            {(["white", "black"] as Color[]).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={color === c ? "default" : "ghost"}
                onClick={() => {
                  setColor(c);
                  setPicked(null);
                }}
                className={color === c ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
              >
                As {c}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="border-border/60 bg-card/40 p-3 lg:col-span-3">
          <div className="mb-1 flex items-center justify-between px-2 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Move</span>
            <span>W / D / L - Games</span>
          </div>
          <div className="max-h-[600px] overflow-auto pr-1">
            {tree.children.length > 0 ? (
              tree.children.map((c) => (
                <NodeRow key={`${c.san}-${c.fen}`} node={c} onPick={setPicked} />
              ))
            ) : (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                No {color} games imported yet.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <MiniBoard node={selected} color={color} />
          <Card className="border-border/60 bg-card/40 p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Selected line
            </div>
            <h3 className="font-display mt-1 text-2xl font-semibold">{selected.san || "Start"}</h3>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-md border border-win/20 bg-win/10 p-2 text-center">
                <div className="font-display text-xl font-bold text-win">{selected.wins}</div>
                <div className="font-mono text-[10px] uppercase text-muted-foreground">Wins</div>
              </div>
              <div className="rounded-md border border-draw/20 bg-draw/10 p-2 text-center">
                <div className="font-display text-xl font-bold text-draw">{selected.draws}</div>
                <div className="font-mono text-[10px] uppercase text-muted-foreground">Draws</div>
              </div>
              <div className="rounded-md border border-loss/20 bg-loss/10 p-2 text-center">
                <div className="font-display text-xl font-bold text-loss">{selected.losses}</div>
                <div className="font-mono text-[10px] uppercase text-muted-foreground">Losses</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <BookmarkCheck className="h-3.5 w-3.5 text-accent" />
              Save-to-repertoire actions can attach to this selected FEN next.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
