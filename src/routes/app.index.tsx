import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { mockGames, skills, ratingHistory, stats, mistakes } from "@/lib/mock-data";
import { TrendingUp, TrendingDown, Flame, ArrowUpRight, AlertTriangle, Brain, GitBranch, Swords } from "lucide-react";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview · NeverPay4Chess" }] }),
  component: Overview,
});

function Sparkline({ data }: { data: { rating: number }[] }) {
  const max = Math.max(...data.map((d) => d.rating));
  const min = Math.min(...data.map((d) => d.rating));
  const range = max - min || 1;
  const w = 200, h = 50;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.rating - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sparkfill)" />
      <polyline points={pts} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Overview() {
  const recent = mockGames.slice(0, 5);
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Today's training plan"
        title="Welcome back, magnusfan_99"
        description="Your weakest area this week is endgames. We've queued 8 positions for you to drill."
        actions={
          <>
            <Button variant="outline">Resume training</Button>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              Start session <ArrowUpRight className="ml-1 h-4 w-4" />
            </Button>
          </>
        }
      />

      {/* Top stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5 border-border/60 bg-card/40">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Current rating</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-4xl font-semibold">{stats.rating}</div>
            <Badge className="bg-win/15 text-win border-win/30 hover:bg-win/15 gap-1">
              <TrendingUp className="h-3 w-3" /> +{stats.ratingDelta}
            </Badge>
          </div>
          <Sparkline data={ratingHistory} />
        </Card>

        <Card className="p-5 border-border/60 bg-card/40">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Win rate</div>
          <div className="mt-2 font-display text-4xl font-semibold">{stats.winRate}%</div>
          <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-muted">
            <div className="bg-win" style={{ width: `${stats.winRate}%` }} />
            <div className="bg-draw" style={{ width: `${stats.drawRate}%` }} />
            <div className="bg-loss" style={{ width: `${stats.lossRate}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-mono text-muted-foreground">
            <span>{stats.winRate}W</span><span>{stats.drawRate}D</span><span>{stats.lossRate}L</span>
          </div>
        </Card>

        <Card className="p-5 border-border/60 bg-card/40">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Games imported</div>
          <div className="mt-2 font-display text-4xl font-semibold">{stats.totalGames}</div>
          <div className="mt-3 text-xs text-muted-foreground">across chess.com & lichess</div>
          <Link to="/app/games" className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
            See history <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>

        <Card className="p-5 border-border/60 bg-card/40 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Win streak</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-4xl font-semibold">{stats.streak}</div>
            <Flame className="h-5 w-5 text-accent" />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Keep it going.</div>
        </Card>
      </div>

      {/* Two col */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent games */}
        <Card className="lg:col-span-2 p-5 border-border/60 bg-card/40">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Swords className="h-4 w-4 text-accent" /> Recent games
              </h3>
              <p className="text-xs text-muted-foreground">Last 5 games imported</p>
            </div>
            <Link to="/app/games" className="text-xs text-accent hover:underline">View all →</Link>
          </div>
          <div className="space-y-1">
            {recent.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/40 transition group cursor-pointer">
                <div className={`h-2 w-2 rounded-full shrink-0 ${g.result === "win" ? "bg-win" : g.result === "loss" ? "bg-loss" : "bg-draw"}`} />
                <div className="w-6 h-6 rounded-sm grid place-items-center font-mono text-[10px] shrink-0 bg-muted">
                  {g.color === "white" ? "♔" : "♚"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.opening}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">vs {g.opponent} · {g.opponentRating}</div>
                </div>
                <div className="hidden sm:block text-right">
                  <div className={`text-xs font-mono font-semibold ${g.result === "win" ? "text-win" : g.result === "loss" ? "text-loss" : "text-draw"}`}>
                    {g.result.toUpperCase()}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">{g.accuracy}% acc</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Skill panel */}
        <Card className="p-5 border-border/60 bg-card/40">
          <h3 className="font-display text-lg font-semibold mb-1">Your skills</h3>
          <p className="text-xs text-muted-foreground mb-4">Strength by area</p>
          <div className="space-y-3">
            {skills.map((s) => (
              <div key={s.name}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {s.value}
                    <span className={s.delta >= 0 ? "text-win ml-1" : "text-loss ml-1"}>
                      {s.delta >= 0 ? "+" : ""}{s.delta}
                    </span>
                  </span>
                </div>
                <Progress value={s.value} className="h-1.5" />
              </div>
            ))}
          </div>
          <Link to="/app/skills" className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline">
            See full breakdown <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      {/* Recommendation cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {[
          { icon: AlertTriangle, color: "loss", label: "Mistakes", title: `${mistakes.length} new mistakes`, desc: "Review and learn from your latest blunders.", to: "/app/mistakes" },
          { icon: Brain, color: "gold", label: "Train", title: "8 positions due", desc: "Spaced repetition cards ready for today.", to: "/app/train" },
          { icon: GitBranch, color: "draw", label: "Repertoire", title: "Italian Game (white)", desc: "12 lines saved · 3 missing replies.", to: "/app/repertoire" },
        ].map((c) => (
          <Link key={c.title} to={c.to as string} className="group">
            <Card className="p-5 border-border/60 bg-card/40 h-full hover:border-accent/40 hover:bg-card/60 transition">
              <div className="flex items-center gap-2 mb-3">
                <c.icon className="h-4 w-4 text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</span>
              </div>
              <h4 className="font-display text-lg font-semibold">{c.title}</h4>
              <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
              <div className="mt-3 text-xs text-accent inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                Open <ArrowUpRight className="h-3 w-3" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export { TrendingDown };
