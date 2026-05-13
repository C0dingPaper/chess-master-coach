import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames, usePinned, useRepertoire } from "@/lib/chess/hooks";
import { computeSkills, computeStats, detectIssues, ratingTimeline } from "@/lib/chess/stats";
import type { StoredGame } from "@/lib/chess/types";
import {
  TrendingUp,
  Flame,
  ArrowUpRight,
  AlertTriangle,
  Brain,
  GitBranch,
  Swords,
} from "lucide-react";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview - NeverPay4Chess" }] }),
  component: Overview,
});

function Sparkline({ data }: { data: { rating: number }[] }) {
  const chartData =
    data.length >= 2 ? data : [{ rating: data[0]?.rating ?? 0 }, { rating: data[0]?.rating ?? 0 }];
  const max = Math.max(...chartData.map((d) => d.rating));
  const min = Math.min(...chartData.map((d) => d.rating));
  const range = max - min || 1;
  const w = 200;
  const h = 50;
  const pts = chartData
    .map((d, i) => {
      const x = (i / (chartData.length - 1)) * w;
      const y = h - ((d.rating - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sparkfill)" />
      <polyline
        points={pts}
        fill="none"
        stroke="var(--gold)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function colorGlyph(game: StoredGame) {
  return game.myColor === "white" ? "W" : "B";
}

function Overview() {
  const conn = useConnection();
  const games = useGames();
  const pinned = usePinned();
  const repertoire = useRepertoire();

  if (!conn || games.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Import your games to build the dashboard"
          description="Connect a Chess.com or Lichess username and the overview will fill with your real rating, results, openings, and training queue."
        />
      </div>
    );
  }

  const stats = computeStats(games);
  const skills = computeSkills(games);
  const timeline = ratingTimeline(games);
  const issues = detectIssues(games);
  const recent = games.slice(0, 5);
  const due = pinned.filter((p) => p.due <= Date.now());
  const weakest = [...skills].sort((a, b) => a.value - b.value)[0];
  const streakLabel =
    stats.currentStreak > 0
      ? `${stats.currentStreak} win${stats.currentStreak === 1 ? "" : "s"}`
      : stats.currentStreak < 0
        ? `${Math.abs(stats.currentStreak)} loss${stats.currentStreak === -1 ? "" : "es"}`
        : "No streak";

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Today's training plan"
        title={`Welcome back, ${conn.username}`}
        description={`Your weakest current area is ${weakest.name.toLowerCase()}. The dashboard is built from ${games.length} imported ${conn.platform} games.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/train">Resume training</Link>
            </Button>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/app/games">
                Review games <ArrowUpRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 bg-card/40 p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Current rating
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-4xl font-semibold">{stats.rating ?? "N/A"}</div>
            {stats.ratingDelta !== 0 && (
              <Badge className="gap-1 border-win/30 bg-win/15 text-win hover:bg-win/15">
                <TrendingUp className="h-3 w-3" />
                {stats.ratingDelta > 0 ? "+" : ""}
                {stats.ratingDelta}
              </Badge>
            )}
          </div>
          <Sparkline data={timeline} />
        </Card>

        <Card className="border-border/60 bg-card/40 p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Win rate
          </div>
          <div className="mt-2 font-display text-4xl font-semibold">{stats.winRate}%</div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-win" style={{ width: `${stats.winRate}%` }} />
            <div className="bg-draw" style={{ width: `${stats.drawRate}%` }} />
            <div className="bg-loss" style={{ width: `${stats.lossRate}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{stats.wins}W</span>
            <span>{stats.draws}D</span>
            <span>{stats.losses}L</span>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/40 p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Games imported
          </div>
          <div className="mt-2 font-display text-4xl font-semibold">{stats.total}</div>
          <div className="mt-3 text-xs text-muted-foreground">from {conn.platform}</div>
          <Link
            to="/app/games"
            className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            See history <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>

        <Card className="relative overflow-hidden border-border/60 bg-card/40 p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Current streak
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-4xl font-semibold">
              {Math.abs(stats.currentStreak)}
            </div>
            <Flame className="h-5 w-5 text-accent" />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">{streakLabel}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/40 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold">
                <Swords className="h-4 w-4 text-accent" /> Recent games
              </h3>
              <p className="text-xs text-muted-foreground">Last 5 games imported</p>
            </div>
            <Link to="/app/games" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-1">
            {recent.map((g) => (
              <a
                key={g.id}
                href={g.url}
                target="_blank"
                rel="noreferrer"
                className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition hover:bg-muted/40"
              >
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    g.result === "win" ? "bg-win" : g.result === "loss" ? "bg-loss" : "bg-draw"
                  }`}
                />
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-muted font-mono text-[10px]">
                  {colorGlyph(g)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{g.opening}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    vs {g.oppName} - {g.oppRating ?? "unrated"}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <div
                    className={`font-mono text-xs font-semibold ${
                      g.result === "win"
                        ? "text-win"
                        : g.result === "loss"
                          ? "text-loss"
                          : "text-draw"
                    }`}
                  >
                    {g.result.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {g.accuracy == null ? formatDate(g.endTime) : `${g.accuracy}% acc`}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </Card>

        <Card className="border-border/60 bg-card/40 p-5">
          <h3 className="font-display mb-1 text-lg font-semibold">Your skills</h3>
          <p className="mb-4 text-xs text-muted-foreground">Estimated from imported games</p>
          <div className="space-y-3">
            {skills.map((s) => (
              <div key={s.name}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {s.value}
                    <span className={s.delta >= 0 ? "ml-1 text-win" : "ml-1 text-loss"}>
                      {s.delta >= 0 ? "+" : ""}
                      {s.delta}
                    </span>
                  </span>
                </div>
                <Progress value={s.value} className="h-1.5" />
              </div>
            ))}
          </div>
          <Link
            to="/app/skills"
            className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            See full breakdown <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            icon: AlertTriangle,
            label: "Mistakes",
            title: `${issues.length} issues detected`,
            desc: "Heuristic review queue from short losses, mates, and low-accuracy games.",
            to: "/app/mistakes",
          },
          {
            icon: Brain,
            label: "Train",
            title: `${due.length} positions due`,
            desc: `${pinned.length} total pinned training positions.`,
            to: "/app/train",
          },
          {
            icon: GitBranch,
            label: "Repertoire",
            title: `${repertoire.length} saved lines`,
            desc: "Saved opening lines and notes from your personal book.",
            to: "/app/repertoire",
          },
        ].map((c) => (
          <Link key={c.title} to={c.to as string} className="group">
            <Card className="h-full border-border/60 bg-card/40 p-5 transition hover:border-accent/40 hover:bg-card/60">
              <div className="mb-3 flex items-center gap-2">
                <c.icon className="h-4 w-4 text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {c.label}
                </span>
              </div>
              <h4 className="font-display text-lg font-semibold">{c.title}</h4>
              <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
              <div className="mt-3 inline-flex items-center gap-1 text-xs text-accent opacity-0 transition group-hover:opacity-100">
                Open <ArrowUpRight className="h-3 w-3" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
