import { timeFormatLabel } from "@/lib/chess/time-format";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames } from "@/lib/chess/hooks";
import type { StoredGame } from "@/lib/chess/types";
import { ArrowRight, ChevronLeft, ChevronRight, Download, Search, Swords, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

export const Route = createFileRoute("/app/games")({
  head: () => ({ meta: [{ title: "Games - NeverPay4Chess" }] }),
  component: GamesPage,
});

type FilterValue = "all" | "wins" | "losses" | "draws" | "white" | "black";
const PAGE_SIZE = 25;
const filters: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All games" },
  { value: "wins", label: "Wins" },
  { value: "losses", label: "Losses" },
  { value: "draws", label: "Draws" },
  { value: "white", label: "As white" },
  { value: "black", label: "As black" },
];
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function matchesFilter(game: StoredGame, filter: FilterValue) {
  if (filter === "all") return true;
  if (filter === "wins") return game.result === "win";
  if (filter === "losses") return game.result === "loss";
  if (filter === "draws") return game.result === "draw";
  if (filter === "white") return game.myColor === "white";
  return game.myColor === "black";
}

function exportPgn(games: StoredGame[]) {
  const blob = new Blob([games.map((game) => game.pgn.trim()).join("\n\n")], {
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
  const navigate = useNavigate();
  const conn = useConnection();
  const games = useGames();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const totals = useMemo(
    () =>
      games.reduce(
        (counts, game) => {
          counts[game.result] += 1;
          return counts;
        },
        { win: 0, loss: 0, draw: 0 },
      ),
    [games],
  );
  const filtered = useMemo(
    () =>
      games.filter(
        (game) =>
          matchesFilter(game, filter) &&
          (!deferredSearch ||
            `${game.oppName} ${game.opening} ${game.eco}`.toLowerCase().includes(deferredSearch)),
      ),
    [filter, games, deferredSearch],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleGames = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (!conn || games.length === 0) {
    return (
      <div className="app-page">
        <PageHeader
          eyebrow="Your library"
          title="My games"
          description="Every game is an opportunity to learn something new."
        />
        <EmptyConnect
          title="Your game library starts here"
          description="Import your Chess.com or Lichess games to explore openings, review results, and revisit your best moves."
        />
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Your library"
        title="My games"
        description={`${games.length.toLocaleString()} games from ${conn.platform}. Find a game and take a closer look.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportPgn(filtered)}
            disabled={filtered.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export PGN
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Total games",
            value: games.length,
            color: "text-foreground",
            dot: "bg-foreground/50",
          },
          { label: "Wins", value: totals.win, color: "text-win", dot: "bg-win" },
          { label: "Draws", value: totals.draw, color: "text-draw", dot: "bg-draw" },
          { label: "Losses", value: totals.loss, color: "text-loss", dot: "bg-loss" },
        ].map((stat) => (
          <div key={stat.label} className="surface-card px-5 py-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${stat.dot}`} />
              {stat.label}
            </div>
            <div className={`text-2xl font-semibold tracking-tight tabular-nums ${stat.color}`}>
              {stat.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <Card className="surface-card gap-0 overflow-hidden py-0">
        <div className="flex flex-col justify-between gap-4 border-b border-border p-4 xl:flex-row xl:items-center">
          <div aria-label="Filter games" className="flex flex-wrap gap-1">
            {filters.map((item) => (
              <Button
                key={item.value}
                variant="ghost"
                size="sm"
                aria-pressed={filter === item.value}
                className={
                  filter === item.value
                    ? "bg-accent/10 text-accent hover:bg-accent/15 hover:text-accent"
                    : "text-muted-foreground"
                }
                onClick={() => {
                  setFilter(item.value);
                  setPage(0);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="relative w-full xl:w-64 xl:shrink-0">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search by opponent, opening, or ECO"
              placeholder="Search games…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              className="h-9 pl-9 pr-9 text-sm"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Imported games with results, opponent, opening, and review links
            </caption>
            <thead>
              <tr className="border-b border-border bg-background/70 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <th scope="col" className="px-5 py-3.5 text-left">
                  Result
                </th>
                <th scope="col" className="px-4 py-3.5 text-left">
                  Opponent
                </th>
                <th scope="col" className="hidden px-4 py-3.5 text-left sm:table-cell">
                  Opening
                </th>
                <th scope="col" className="hidden px-4 py-3.5 text-left xl:table-cell">
                  Format
                </th>
                <th scope="col" className="hidden px-4 py-3.5 text-right lg:table-cell">
                  Accuracy
                </th>
                <th scope="col" className="hidden px-4 py-3.5 text-right md:table-cell">
                  Date
                </th>
                <th scope="col" className="px-4 py-3.5">
                  <span className="sr-only">Review</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleGames.map((game) => (
                <tr
                  key={game.id}
                  tabIndex={0}
                  aria-label={`Open game against ${game.oppName || "unknown opponent"}`}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a, button")) return;
                    if (window.getSelection()?.toString()) return;
                    if (event.ctrlKey || event.metaKey || event.shiftKey) {
                      window.open(
                        `/app/games/${encodeURIComponent(game.id)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    } else {
                      void navigate({ to: "/app/games/$gameId", params: { gameId: game.id } });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key))
                      return;
                    event.preventDefault();
                    void navigate({ to: "/app/games/$gameId", params: { gameId: game.id } });
                  }}
                  className="group cursor-pointer focus-visible:outline-2 focus-visible:outline-accent border-b border-border/60 transition-colors last:border-0 hover:bg-background/70"
                >
                  <td className="whitespace-nowrap px-5 py-4">
                    <div className="flex flex-col items-start gap-1.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold capitalize ${game.result === "win" ? "bg-win/10 text-win" : game.result === "loss" ? "bg-loss/8 text-loss" : "bg-muted text-muted-foreground"}`}
                      >
                        {game.result === "loss" ? "Loss" : game.result}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span
                          className={`h-2 w-2 rounded-full border ${game.myColor === "white" ? "border-slate-400 bg-white" : "border-slate-600 bg-slate-700"}`}
                        />
                        {game.myColor === "white" ? "White" : "Black"}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[160px] px-4 py-4">
                    <Link
                      to="/app/games/$gameId"
                      params={{ gameId: game.id }}
                      className="block truncate font-semibold hover:text-accent"
                    >
                      {game.oppName || "Unknown"}
                    </Link>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {game.oppRating ?? "Unrated"}
                    </div>
                  </td>
                  <td className="hidden max-w-[260px] px-4 py-4 sm:table-cell">
                    <div className="truncate" title={game.opening}>
                      {game.opening}
                    </div>
                    <Badge
                      variant="outline"
                      className="mt-1.5 rounded px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                    >
                      {game.eco}
                    </Badge>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-xs text-muted-foreground tabular-nums xl:table-cell">
                    {timeFormatLabel(game)}
                  </td>
                  <td className="hidden px-4 py-4 text-right text-sm font-medium tabular-nums lg:table-cell">
                    {game.accuracy == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          game.accuracy >= 85
                            ? "text-win"
                            : game.accuracy >= 75
                              ? "text-foreground"
                              : "text-loss"
                        }
                      >
                        {game.accuracy}%
                      </span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-right text-xs text-muted-foreground md:table-cell">
                    {dateFormatter.format(new Date(game.endTime * 1000))}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="text-muted-foreground hover:text-accent"
                    >
                      <Link
                        to="/app/games/$gameId"
                        params={{ gameId: game.id }}
                        aria-label={`Review game against ${game.oppName || "unknown opponent"}`}
                      >
                        <span className="hidden lg:inline">Review</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <Swords className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
                    <p className="font-medium">No games found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try another opening, opponent, or result filter.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setFilter("all");
                        setSearch("");
                        setPage(0);
                      }}
                    >
                      Clear filters
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5">
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {filtered.length === 0
              ? "0 games"
              : `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length.toLocaleString()} games`}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Page {currentPage + 1} of {pageCount}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Previous page"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Next page"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
