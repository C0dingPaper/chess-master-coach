import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  CircleHelp,
  Flame,
  GitBranch,
  ScanSearch,
  Swords,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useConnection, useGames, usePinned, useRepertoire } from "@/lib/chess/hooks";
import { computeSkills, computeStats, detectIssues } from "@/lib/chess/stats";
import { computeFocusAreas } from "@/lib/chess/weaknesses";
const ConnectDialog = lazy(() =>
  import("@/components/connect-dialog").then((m) => ({ default: m.ConnectDialog })),
);
export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview - NeverPay4Chess" }] }),
  component: Overview,
});

function Overview() {
  const conn = useConnection();
  const games = useGames();
  const pinned = usePinned();
  const repertoire = useRepertoire();
  const [connectOpen, setConnectOpen] = useState(false);
  const hasGames = games.length > 0;
  const stats = useMemo(() => computeStats(games), [games]);
  const skills = useMemo(() => computeSkills(games), [games]);
  const issues = useMemo(() => detectIssues(games), [games]);
  const due = pinned.filter((position) => position.due <= Date.now());
  const focusAreas = useMemo(() => computeFocusAreas(games), [games]);

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Your personal chess workspace"
        title={conn ? `Welcome back, ${conn.username}.` : "Make your next move count."}
        description={
          hasGames
            ? "A clear view of your game. A focused path to getting better."
            : "Your games, your openings, your progress. Everything you need to improve, in one place."
        }
        actions={
          <Button variant="outline" asChild>
            <Link to={hasGames ? "/app/train" : "/app/games"}>
              {hasGames ? <Brain /> : <Swords />}
              {hasGames ? "Start training" : "Explore your games"}
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Current rating",
            value: hasGames ? (stats.rating ?? "Unrated") : "—",
            detail: hasGames
              ? `${stats.ratingDelta > 0 ? "+" : ""}${stats.ratingDelta} over the last 30 days`
              : "Connect to see your rating",
            icon: TrendingUp,
            tone: "text-accent bg-accent/8",
          },
          {
            label: "Win rate",
            value: hasGames ? `${stats.winRate}%` : "—",
            detail: hasGames
              ? `${stats.wins} wins · ${stats.draws} draws · ${stats.losses} losses`
              : "Your results, at a glance",
            icon: Trophy,
            tone: "text-[#a7762e] bg-[#a7762e]/8",
          },
          {
            label: "Games reviewed",
            value: hasGames ? games.length.toLocaleString() : "0",
            detail: hasGames
              ? `Imported from ${conn?.platform ?? "your account"}`
              : "Your game library starts here",
            icon: Swords,
            tone: "text-[#547bac] bg-[#547bac]/8",
          },
          {
            label: "Training queue",
            value: due.length.toString(),
            detail: pinned.length
              ? `${pinned.length} saved positions · ${due.length} due`
              : "Build your personal practice",
            icon: Brain,
            tone: "text-[#9471aa] bg-[#9471aa]/8",
          },
        ].map((metric) => (
          <div key={metric.label} className="surface-card metric-card">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {metric.label === "Games reviewed" ? "Games imported" : metric.label}
              </span>
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${metric.tone}`}
              >
                <metric.icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="metric-value">{metric.value}</div>
            <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              {metric.detail}
            </div>
          </div>
        ))}
      </div>

      <div className="overview-workspace">
        <section aria-labelledby="overview-focus-heading" className="min-w-0 py-1">
          <h2 id="overview-focus-heading" className="text-lg font-semibold">
            Your three main focus areas
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {hasGames
              ? `Based on all ${games.length} imported games. Ranked from game results, not rating changes.`
              : "Import your games to find recurring weaknesses and decide what to practice."}
          </p>
          {hasGames ? (
            <ol className="mt-5 divide-y divide-border">
              {focusAreas.map((area, index) => (
                <li key={area.id} className="py-5 first:pt-0">
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm text-muted-foreground">{index + 1}.</span>
                    <h3 className="text-base font-semibold">{area.title}</h3>
                  </div>
                  <p className="ml-6 mt-2 text-xs leading-relaxed text-muted-foreground">
                    {area.evidence}
                  </p>
                  <p className="ml-6 mt-2 text-sm leading-relaxed">{area.action}</p>
                  {area.priority === 0 && (
                    <p className="ml-6 mt-2 text-xs text-muted-foreground">
                      Practice priority; not a confirmed weakness.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Button variant="outline" className="mt-5" onClick={() => setConnectOpen(true)}>
              Import games <ArrowRight />
            </Button>
          )}
          {hasGames && (
            <>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Results suggest where to investigate. Analyze the relevant games to confirm the
                cause.
              </p>
              <Link
                to="/app/games"
                className="mt-4 inline-flex items-center gap-1 text-sm text-accent"
              >
                Review these games <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="overview-focus">
            <div className="mb-5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#b6d4c6]">
              <Target className="h-3.5 w-3.5" />{" "}
              {hasGames ? "Your next step" : "A stronger game starts here"}
            </div>
            <h2 className="text-[25px] font-semibold leading-[1.2] tracking-tight">
              {hasGames
                ? due.length
                  ? `${due.length} positions.\nOne sharper player.`
                  : "Turn your last game into your next lesson."
                : "Small improvements.\nStronger chess."}
            </h2>
            <p className="mt-3 text-xs leading-[1.8] text-[#bdd1c9]">
              {hasGames
                ? due.length
                  ? "Your personal training queue is ready. Revisit key positions and make the right moves stick."
                  : `Start with ${focusAreas[0]?.title.toLowerCase() ?? "reviewing your games"}. Work on one priority at a time and use your own games as practice material.`
                : "Connect your Chess.com or Lichess account. We’ll bring your games together so you can focus on what to improve."}
            </p>
            {hasGames ? (
              <Button
                asChild
                className="mt-5 w-full bg-white text-[#214d3d] shadow-none hover:bg-[#edf4ef]"
              >
                <Link to={due.length ? "/app/train" : "/app/games"}>
                  {due.length ? "Start a training session" : "Review your games"}
                  <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button
                onClick={() => setConnectOpen(true)}
                className="mt-5 w-full bg-white text-[#214d3d] shadow-none hover:bg-[#edf4ef]"
              >
                Connect your account <ArrowRight />
              </Button>
            )}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-[#bdd1c9]">
              {hasGames ? (
                <>
                  <Flame className="h-3 w-3" />
                  {stats.currentStreak > 0
                    ? `${stats.currentStreak} game winning streak. Keep learning.`
                    : "One thoughtful review makes a difference."}
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" /> No password needed. No subscription.
                </>
              )}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Your improvement toolkit</h2>
            </div>
            {[
              {
                title: "Explore your openings",
                desc: "Find the lines that work for you",
                icon: GitBranch,
                to: "/app/openings",
                value: "",
              },
              {
                title: "Build your repertoire",
                desc: "Give every position a plan",
                icon: BookOpen,
                to: "/app/repertoire",
                value: repertoire.length ? String(repertoire.length) : "",
              },
              {
                title: "Learn from mistakes",
                desc: "Find a better move next time",
                icon: ScanSearch,
                to: "/app/mistakes",
                value: issues.length ? String(issues.length) : "",
              },
            ].map((item) => (
              <Link key={item.to} to={item.to} className="quick-link">
                <span className="icon-tile">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">{item.title}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">{item.desc}</span>
                </span>
                {item.value && <span className="text-xs text-muted-foreground">{item.value}</span>}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </section>
          <div className="flex items-start gap-2.5 px-1">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Your workspace is personal. Games and training progress are saved in this browser on
              this device.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]">
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Recent games</h2>
            <Link
              to="/app/games"
              className="flex items-center gap-1 text-[11px] font-medium text-accent"
            >
              View all games <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {hasGames ? (
            <div className="divide-y divide-border">
              {games.slice(0, 5).map((game) => (
                <Link
                  key={game.id}
                  to="/app/games/$gameId"
                  params={{ gameId: game.id }}
                  className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-secondary/40"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted font-serif text-xl">
                    {game.myColor === "white" ? "♙" : "♟"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{game.opening}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      vs {game.oppName} · {game.oppRating ?? "Unrated"}
                    </span>
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold capitalize ${game.result === "win" ? "bg-win/8 text-win" : game.result === "loss" ? "bg-loss/8 text-loss" : "bg-muted text-muted-foreground"}`}
                  >
                    {game.result}
                  </span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center p-6 text-center">
              <span className="icon-tile mb-3">
                <Swords className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-semibold">Every game has something to teach you.</h3>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Import your games to explore your history and revisit the moments that mattered.
              </p>
              <button
                onClick={() => setConnectOpen(true)}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent"
              >
                Import your first games <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </section>
        <section className="surface-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your skill profile</h2>
            <Link
              to="/app/skills"
              aria-label="View skills and progress"
              className="rounded p-1 text-muted-foreground hover:text-accent"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mb-5 text-[10px] text-muted-foreground">
            {hasGames
              ? "Estimates based on your imported games"
              : "Your strengths will take shape as you play"}
          </p>
          <div className="space-y-3.5">
            {skills.map((skill) => (
              <div key={skill.name}>
                <div className="mb-1.5 flex justify-between text-[11px]">
                  <span>{skill.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {hasGames ? skill.value : "—"}
                  </span>
                </div>
                <Progress value={hasGames ? skill.value : 0} className="h-1.5 bg-muted" />
              </div>
            ))}
          </div>
        </section>
      </div>
      {connectOpen && (
        <Suspense fallback={null}>
          <ConnectDialog
            open={connectOpen}
            onOpenChange={setConnectOpen}
            initialUsername={conn?.username}
            initialPlatform={conn?.platform}
          />
        </Suspense>
      )}
    </div>
  );
}
