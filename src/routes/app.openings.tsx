import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames, useIsClient } from "@/lib/chess/hooks";
import { buildOpeningTree, serializeTree, type SerializedNode } from "@/lib/chess/opening-tree";
import type { Color } from "@/lib/chess/types";
import { BookmarkCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";

export const Route = createFileRoute("/app/openings")({
  head: () => ({ meta: [{ title: "Opening Tree - NeverPay4Chess" }] }),
  component: OpeningsPage,
});

type SelectedLine = {
  color: Color;
  nodes: SerializedNode[];
  index: number;
};

function pct(part: number, total: number) {
  return total ? (part / total) * 100 : 0;
}

function NodeRow({
  node,
  ancestors = [],
  depth = 0,
  onPick,
}: {
  node: SerializedNode;
  ancestors?: SerializedNode[];
  depth?: number;
  onPick: (line: Omit<SelectedLine, "color">) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const winRate = node.count ? Math.round((node.wins / node.count) * 100) : 0;
  const hasChildren = node.children.length > 0;
  const line = [...ancestors, node];
  return (
    <div>
      <div
        onClick={() => {
          onPick({ nodes: line, index: line.length - 1 });
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
            <NodeRow
              key={`${c.san}-${c.fen}`}
              node={c}
              ancestors={line}
              depth={depth + 1}
              onPick={onPick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeSection({
  color,
  tree,
  onPick,
}: {
  color: Color;
  tree: SerializedNode;
  onPick: (line: SelectedLine) => void;
}) {
  return (
    <section className="rounded-md border border-border/50 bg-background/30">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div>
          <h3 className="font-display text-lg font-semibold capitalize">{color} openings</h3>
          <p className="text-xs text-muted-foreground">
            {color === "white" ? "Games where you had White" : "Games where you had Black"}
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {tree.count} games
        </Badge>
      </div>
      <div className="max-h-[380px] overflow-auto p-1">
        {tree.children.length > 0 ? (
          tree.children.map((node) => (
            <NodeRow
              key={`${color}-${node.san}-${node.fen}`}
              node={node}
              onPick={(line) => onPick({ ...line, color })}
            />
          ))
        ) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No {color} games imported yet.
          </div>
        )}
      </div>
    </section>
  );
}

function PositionBoard({
  node,
  color,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  node: SerializedNode;
  color: Color;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const isClient = useIsClient();

  return (
    <Card className="border-border/60 bg-card/40 p-3">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="aspect-square overflow-hidden rounded-md border border-border/60 bg-muted shadow-elegant">
          {isClient ? (
            <Chessboard
              options={{
                id: "opening-tree-board",
                position: node.fen,
                boardOrientation: color,
                allowDragging: false,
                allowDrawingArrows: true,
                showNotation: true,
                animationDurationInMs: 160,
                darkSquareStyle: { backgroundColor: "oklch(0.45 0.05 70)" },
                lightSquareStyle: { backgroundColor: "oklch(0.88 0.04 85)" },
                boardStyle: { width: "100%", height: "100%" },
              }}
            />
          ) : (
            <div className="bg-board h-full w-full" />
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Previous position"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 rounded-md border border-border/50 bg-background/60 px-3 py-2">
          <div className="truncate font-mono text-xs">
            Position after <span className="text-accent">{node.san || "start"}</span>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
            {node.fen}
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={onForward}
          disabled={!canGoForward}
          aria-label="Next position"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function OpeningsPage() {
  const conn = useConnection();
  const games = useGames();
  const [picked, setPicked] = useState<SelectedLine | null>(null);
  const trees = useMemo(
    () => ({
      white: serializeTree(buildOpeningTree(games, "white")),
      black: serializeTree(buildOpeningTree(games, "black")),
    }),
    [games],
  );
  const selectedColor: Color = picked?.color ?? (trees.white.count > 0 ? "white" : "black");
  const selectedRoot = trees[selectedColor];
  const selectedNodes = [selectedRoot, ...(picked?.nodes ?? [])];
  const selectedIndex = picked ? picked.index + 1 : 0;
  const selected = selectedNodes[selectedIndex] ?? selectedRoot;

  function moveSelection(delta: number) {
    if (!picked) return;
    setPicked((current) => {
      if (!current) return current;
      return {
        ...current,
        index: Math.max(-1, Math.min(current.nodes.length - 1, current.index + delta)),
      };
    });
  }

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
        description={`Built from your imported ${conn.platform} games. White and black trees are generated separately from the games you played on each side.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              White {trees.white.count}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              Black {trees.black.count}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="border-border/60 bg-card/40 p-3 lg:col-span-3">
          <div className="mb-1 flex items-center justify-between px-2 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Opening trees</span>
            <span>W / D / L - Games</span>
          </div>
          <div className="space-y-3">
            <TreeSection color="white" tree={trees.white} onPick={setPicked} />
            <TreeSection color="black" tree={trees.black} onPick={setPicked} />
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <PositionBoard
            node={selected}
            color={selectedColor}
            canGoBack={Boolean(picked && picked.index > -1)}
            canGoForward={Boolean(picked && picked.index < picked.nodes.length - 1)}
            onBack={() => moveSelection(-1)}
            onForward={() => moveSelection(1)}
          />
          <Card className="border-border/60 bg-card/40 p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Selected line
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h3 className="font-display text-2xl font-semibold">{selected.san || "Start"}</h3>
              <Badge variant="outline" className="font-mono text-[10px] capitalize">
                {selectedColor}
              </Badge>
            </div>
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
