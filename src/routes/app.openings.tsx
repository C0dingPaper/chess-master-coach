import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames, useIsClient } from "@/lib/chess/hooks";
import { buildOpeningTree, serializeTree, type SerializedNode } from "@/lib/chess/opening-tree";
import type { Color, StoredGame } from "@/lib/chess/types";
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

type EloCarrier = {
  color: Color;
  opening: string;
  eco: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  scorePct: number;
  pointsAboveBreakEven: number;
  ratingGain: number | null;
  carrierScore: number;
  smallSample: boolean;
};

function pct(part: number, total: number) {
  return total ? (part / total) * 100 : 0;
}

function moveNumber(depth: number) {
  return Math.floor(depth / 2) + 1;
}

function formatStandardMoveLabel(depth: number, san: string) {
  const number = moveNumber(depth);
  return depth % 2 === 0 ? `${number}. ${san}` : `${number}... ${san}`;
}

function formatTreeMoveLabel(color: Color, depth: number, san: string) {
  if (color === "black" && depth === 0) return `Against ${formatStandardMoveLabel(depth, san)}`;
  return formatStandardMoveLabel(depth, san);
}

function formatPositionLabel(depth: number, san: string) {
  return formatStandardMoveLabel(depth, san);
}

function formatSignedInt(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatSignedDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return `${rounded}`;
}

function computeEloCarrier(games: StoredGame[]): EloCarrier | null {
  const groups = new Map<
    string,
    { color: Color; opening: string; eco: string; games: StoredGame[] }
  >();

  for (const game of games) {
    const color = game.myColor;
    const opening = game.opening || "Unknown opening";
    const eco = game.eco || "ECO";
    const key = `${color}\u0000${opening}\u0000${eco}`;
    const existing = groups.get(key);
    if (existing) existing.games.push(game);
    else groups.set(key, { color, opening, eco, games: [game] });
  }

  const candidates = Array.from(groups.values()).map((group) => {
    const wins = group.games.filter((game) => game.result === "win").length;
    const draws = group.games.filter((game) => game.result === "draw").length;
    const losses = group.games.filter((game) => game.result === "loss").length;
    const count = group.games.length;
    const points = wins + draws * 0.5;
    const pointsAboveBreakEven = points - count * 0.5;
    const rated = group.games
      .filter((game) => game.myRating != null)
      .sort((a, b) => a.endTime - b.endTime);
    const ratingGain =
      rated.length >= 2 ? rated[rated.length - 1].myRating! - rated[0].myRating! : null;
    const carrierScore = pointsAboveBreakEven * 10 + (ratingGain ?? 0) * 0.1;

    return {
      color: group.color,
      opening: group.opening,
      eco: group.eco,
      count,
      wins,
      draws,
      losses,
      scorePct: Math.round((points / count) * 100),
      pointsAboveBreakEven,
      ratingGain,
      carrierScore,
      smallSample: count < 3,
    };
  });

  if (candidates.length === 0) return null;

  const eligible = candidates.filter((candidate) => candidate.count >= 3);
  const pool = eligible.length > 0 ? eligible : candidates;
  return [...pool].sort(
    (a, b) => b.carrierScore - a.carrierScore || b.count - a.count || b.scorePct - a.scorePct,
  )[0];
}

function NodeRow({
  color,
  node,
  ancestors = [],
  depth = 0,
  activeColor,
  activeFen,
  onPick,
}: {
  color: Color;
  node: SerializedNode;
  ancestors?: SerializedNode[];
  depth?: number;
  activeColor: Color;
  activeFen: string;
  onPick: (line: Omit<SelectedLine, "color">) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const winRate = node.count ? Math.round((node.wins / node.count) * 100) : 0;
  const hasChildren = node.children.length > 0;
  const line = [...ancestors, node];
  const isBlackGroup = color === "black" && depth === 0;
  const isOwnMove = color === "white" ? depth % 2 === 0 : depth % 2 === 1;
  const isActive = activeColor === color && activeFen === node.fen;
  const moveLabel = formatTreeMoveLabel(color, depth, node.san);
  return (
    <div>
      <div
        onClick={() => {
          onPick({ nodes: line, index: line.length - 1 });
          if (hasChildren) setOpen(!open);
        }}
        className={`group grid cursor-pointer grid-cols-[minmax(10rem,1fr)_minmax(6rem,9rem)_3rem_3.5rem] items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition ${
          isActive
            ? "border-accent/50 bg-accent/10"
            : isBlackGroup
              ? "border-border/50 bg-muted/25 hover:bg-muted/40"
              : "border-transparent hover:bg-muted/40"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition ${
              hasChildren ? "" : "opacity-0"
            } ${open ? "rotate-90" : ""}`}
          />
          <span
            className={`truncate rounded border px-2 py-0.5 font-mono text-xs font-semibold ${
              isBlackGroup
                ? "border-border/70 bg-background/80 text-muted-foreground"
                : isOwnMove
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border/60 bg-muted/40 text-foreground"
            }`}
          >
            {moveLabel}
          </span>
          {isOwnMove && !isBlackGroup && (
            <span className="hidden rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground sm:inline">
              mine
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-win" style={{ width: `${pct(node.wins, node.count)}%` }} />
            <div className="bg-draw" style={{ width: `${pct(node.draws, node.count)}%` }} />
            <div className="bg-loss" style={{ width: `${pct(node.losses, node.count)}%` }} />
          </div>
        </div>
        <span
          className={`text-right font-mono text-xs ${
            winRate >= 60 ? "text-win" : winRate >= 40 ? "text-foreground" : "text-loss"
          }`}
        >
          {winRate}%
        </span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {node.count}
        </Badge>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <NodeRow
              key={`${c.san}-${c.fen}`}
              color={color}
              node={c}
              ancestors={line}
              depth={depth + 1}
              activeColor={activeColor}
              activeFen={activeFen}
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
  activeColor,
  activeFen,
  onPick,
}: {
  color: Color;
  tree: SerializedNode;
  activeColor: Color;
  activeFen: string;
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
              color={color}
              node={node}
              activeColor={activeColor}
              activeFen={activeFen}
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

function EloCarrierCard({ carrier }: { carrier: EloCarrier | null }) {
  if (!carrier) return null;

  return (
    <Card className="mb-6 overflow-hidden border-accent/30 bg-card/40">
      <div className="grid gap-px bg-border/50 md:grid-cols-[1.4fr_1fr]">
        <div className="bg-card/95 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="border-accent/30 bg-accent/15 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/15">
              Elo carrier
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] capitalize">
              {carrier.color}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {carrier.eco}
            </Badge>
            {carrier.smallSample && (
              <Badge variant="outline" className="font-mono text-[10px] text-draw">
                Small sample
              </Badge>
            )}
          </div>
          <h2 className="font-display text-2xl font-semibold">{carrier.opening}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatSignedDecimal(carrier.pointsAboveBreakEven)} points above 50% across{" "}
            {carrier.count} games.
            {carrier.ratingGain == null
              ? " Rating trend needs at least two rated games."
              : ` ${formatSignedInt(carrier.ratingGain)} rating over this sample.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border/50 md:grid-cols-2">
          {[
            { label: "Record", value: `${carrier.wins}-${carrier.draws}-${carrier.losses}` },
            { label: "Score", value: `${carrier.scorePct}%` },
            {
              label: "Rating gain",
              value: carrier.ratingGain == null ? "N/A" : formatSignedInt(carrier.ratingGain),
            },
            { label: "Games", value: carrier.count.toString() },
          ].map((stat) => (
            <div key={stat.label} className="bg-card/95 p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {stat.label}
              </div>
              <div className="font-display mt-1 text-2xl font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function PositionBoard({
  node,
  color,
  label,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  node: SerializedNode;
  color: Color;
  label: string;
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
            Position after <span className="text-accent">{label}</span>
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
  const selectedDepth = selectedIndex - 1;
  const selectedTreeLabel =
    selectedDepth >= 0 ? formatTreeMoveLabel(selectedColor, selectedDepth, selected.san) : "Start";
  const selectedPositionLabel =
    selectedDepth >= 0 ? formatPositionLabel(selectedDepth, selected.san) : "start";
  const selectedLineLabels =
    picked == null
      ? []
      : picked.nodes
          .slice(0, Math.max(0, picked.index + 1))
          .map((node, depth) => formatTreeMoveLabel(picked.color, depth, node.san));
  const eloCarrier = useMemo(() => computeEloCarrier(games), [games]);

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

      <EloCarrierCard carrier={eloCarrier} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="border-border/60 bg-card/40 p-3 lg:col-span-3">
          <div className="mb-1 flex items-center justify-between px-2 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Opening trees</span>
            <span>W / D / L - Games</span>
          </div>
          <div className="space-y-3">
            <TreeSection
              color="white"
              tree={trees.white}
              activeColor={selectedColor}
              activeFen={selected.fen}
              onPick={setPicked}
            />
            <TreeSection
              color="black"
              tree={trees.black}
              activeColor={selectedColor}
              activeFen={selected.fen}
              onPick={setPicked}
            />
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <PositionBoard
            node={selected}
            color={selectedColor}
            label={selectedPositionLabel}
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
              <h3 className="font-display text-2xl font-semibold">{selectedTreeLabel}</h3>
              <Badge variant="outline" className="font-mono text-[10px] capitalize">
                {selectedColor}
              </Badge>
            </div>
            {selectedLineLabels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 rounded-md border border-border/50 bg-background/40 p-2">
                {selectedLineLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
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
