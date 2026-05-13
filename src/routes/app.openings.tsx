import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { openingTree, OpeningNode } from "@/lib/mock-data";
import { ChevronRight, BookmarkCheck } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/openings")({
  head: () => ({ meta: [{ title: "Opening Tree · NeverPay4Chess" }] }),
  component: OpeningsPage,
});

function NodeRow({ node, depth = 0, onPick }: { node: OpeningNode; depth?: number; onPick: (n: OpeningNode) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const winRate = node.count ? Math.round((node.wins / node.count) * 100) : 0;
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div>
      <div
        onClick={() => { onPick(node); if (hasChildren) setOpen(!open); }}
        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/40 cursor-pointer transition group"
        style={{ paddingLeft: `${depth * 18 + 12}px` }}
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition ${hasChildren ? "" : "opacity-0"} ${open ? "rotate-90" : ""}`} />
        <span className="font-mono text-sm font-medium w-32 truncate">{node.san}</span>
        {node.inRepertoire && <BookmarkCheck className="h-3.5 w-3.5 text-accent" />}
        <div className="flex-1 flex items-center gap-3">
          <div className="flex h-1.5 flex-1 max-w-xs rounded-full overflow-hidden bg-muted">
            <div className="bg-win" style={{ width: `${(node.wins / node.count) * 100}%` }} />
            <div className="bg-draw" style={{ width: `${(node.draws / node.count) * 100}%` }} />
            <div className="bg-loss" style={{ width: `${(node.losses / node.count) * 100}%` }} />
          </div>
          <span className={`text-xs font-mono w-10 text-right ${winRate >= 60 ? "text-win" : winRate >= 40 ? "text-foreground" : "text-loss"}`}>{winRate}%</span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">{node.count}</Badge>
      </div>
      {open && hasChildren && (
        <div>{node.children!.map((c) => <NodeRow key={c.move} node={c} depth={depth + 1} onPick={onPick} />)}</div>
      )}
    </div>
  );
}

function MiniBoard({ highlight }: { highlight?: string }) {
  return (
    <div className="bg-board aspect-square rounded-md shadow-elegant relative grain overflow-hidden">
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-6xl opacity-20 font-display">♚</div>
      </div>
      {highlight && (
        <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded bg-background/80 backdrop-blur font-mono text-xs">
          Position after <span className="text-accent">{highlight}</span>
        </div>
      )}
    </div>
  );
}

function OpeningsPage() {
  const [picked, setPicked] = useState<OpeningNode>(openingTree.children![0]);
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Personal opening tree"
        title="Your repertoire, by the numbers"
        description="Built from the openings you actually play. Win rate, frequency, and your saved moves — all in one tree."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 p-3 border-border/60 bg-card/40">
          <div className="px-2 py-2 mb-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>Move</span>
            <span>W / D / L · Games</span>
          </div>
          <div className="max-h-[600px] overflow-auto pr-1">
            {openingTree.children!.map((c) => <NodeRow key={c.move} node={c} onPick={setPicked} />)}
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <MiniBoard highlight={picked.san} />
          <Card className="p-5 border-border/60 bg-card/40">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Selected line</div>
            <h3 className="font-display text-2xl font-semibold mt-1">{picked.san}</h3>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="text-center p-2 rounded-md bg-win/10 border border-win/20">
                <div className="font-display text-xl font-bold text-win">{picked.wins}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Wins</div>
              </div>
              <div className="text-center p-2 rounded-md bg-draw/10 border border-draw/20">
                <div className="font-display text-xl font-bold text-draw">{picked.draws}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Draws</div>
              </div>
              <div className="text-center p-2 rounded-md bg-loss/10 border border-loss/20">
                <div className="font-display text-xl font-bold text-loss">{picked.losses}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Losses</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              {picked.inRepertoire ? "✓ In your repertoire" : "Not yet in repertoire"}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
