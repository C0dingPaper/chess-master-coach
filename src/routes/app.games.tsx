import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames } from "@/lib/chess/hooks";
import type { StoredGame } from "@/lib/chess/types";
import { ArrowUpRight, Download, Filter } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/app/games")({
  head: () => ({ meta: [{ title: "Games - NeverPay4Chess" }] }),
  component: GamesPage,
});

type FilterValue = "all" | "wins" | "losses" | "draws" | "white" | "black";

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resultClass(result: StoredGame["result"]) {
  if (result === "win") return "text-win";
  if (result === "loss") return "text-loss";
  return "text-draw";
}

function resultDot(result: StoredGame["result"]) {
  if (result === "win") return "bg-win";
  if (result === "loss") return "bg-loss";
  return "bg-draw";
}

function matchesFilter(game: StoredGame, filter: FilterValue) {
  if (filter === "all") return true;
  if (filter === "wins") return game.result === "win";
  if (filter === "losses") return game.result === "loss";
  if (filter === "draws") return game.result === "draw";
  if (filter === "white") return game.myColor === "white";
  return game.myColor === "black";
}

function exportPgn(games: StoredGame[]) {
  const blob = new Blob([games.map((g) => g.pgn.trim()).join("\n\n")], {
    type: "application/x-chess-pgn;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "neverpay4chess-games.pgn";
  link.click();
  URL.revokeObjectURL(url);
}

function GamesPage() {
  const conn = useConnection();
  const games = useGames();
  const [filter, setFilter] = useState<FilterValue>("all");
  const filtered = useMemo(
    () => games.filter((game) => matchesFilter(game, filter)),
    [filter, games],
  );

  if (!conn || games.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Import games before reviewing history"
          description="Your imported Chess.com or Lichess games will appear here with openings, results, ratings, and PGN export."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Game history"
        title="My games"
        description={`${games.length} imported ${conn.platform} games. Open a row to review it inside NeverPay4Chess.`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Filter className="mr-1.5 h-4 w-4" /> Filter
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportPgn(filtered)}>
              <Download className="mr-1.5 h-4 w-4" /> Export PGN
            </Button>
          </>
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as FilterValue)}
        className="mb-4"
      >
        <TabsList className="bg-muted/40">
          <TabsTrigger value="all">All ({games.length})</TabsTrigger>
          <TabsTrigger value="wins">Wins</TabsTrigger>
          <TabsTrigger value="losses">Losses</TabsTrigger>
          <TabsTrigger value="draws">Draws</TabsTrigger>
          <TabsTrigger value="white">As white</TabsTrigger>
          <TabsTrigger value="black">As black</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden border-border/60 bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 text-left">Result</th>
                <th className="px-4 py-3 text-left">Opponent</th>
                <th className="px-4 py-3 text-left">Opening</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">ECO</th>
                <th className="hidden px-4 py-3 text-left lg:table-cell">Time</th>
                <th className="px-4 py-3 text-right">Accuracy</th>
                <th className="hidden px-4 py-3 text-right md:table-cell">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr
                  key={g.id}
                  className="group border-b border-border/30 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full ${resultDot(g.result)}`} />
                      <span
                        className={`font-mono text-xs font-semibold uppercase ${resultClass(g.result)}`}
                      >
                        {g.result.charAt(0)}
                      </span>
                      <span className="font-mono text-xs">{g.myColor === "white" ? "W" : "B"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{g.oppName || "Unknown"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {g.oppRating ?? "unrated"}
                    </div>
                  </td>
                  <td className="px-4 py-3">{g.opening}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {g.eco}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                    {g.timeControl || "unknown"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {g.accuracy == null ? (
                      <span className="text-muted-foreground">N/A</span>
                    ) : (
                      <span
                        className={
                          g.accuracy >= 85
                            ? "text-win"
                            : g.accuracy >= 75
                              ? "text-foreground"
                              : "text-loss"
                        }
                      >
                        {g.accuracy}%
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted-foreground md:table-cell">
                    {formatDate(g.endTime)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={`/app/games/${encodeURIComponent(g.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Review <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No games match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
