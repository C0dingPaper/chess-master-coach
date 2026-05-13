import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames } from "@/lib/chess/hooks";
import { computeSkills, ratingTimeline } from "@/lib/chess/stats";
import { Target, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/skills")({
  head: () => ({ meta: [{ title: "Skills - NeverPay4Chess" }] }),
  component: SkillsPage,
});

type Skill = { name: string; value: number; delta: number };

function RadarChart({ skills }: { skills: Skill[] }) {
  const cx = 150;
  const cy = 150;
  const r = 110;
  const n = skills.length || 1;
  const points = skills.map((s, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (s.value / 100) * r;
    return [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];
  });
  const labels = skills.map((s, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(angle) * (r + 22), cy + Math.sin(angle) * (r + 22), s.name];
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z";
  return (
    <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-md">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={skills
            .map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              return `${cx + Math.cos(angle) * r * f},${cy + Math.sin(angle) * r * f}`;
            })
            .join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      {skills.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(angle) * r}
            y2={cy + Math.sin(angle) * r}
            stroke="var(--border)"
            strokeWidth="1"
          />
        );
      })}
      <path key={`radar-fill-${path}`} d={path} fill="var(--gold)" fillOpacity="0.2" opacity="0">
        <animate attributeName="opacity" from="0" to="1" dur="520ms" fill="freeze" />
      </path>
      <path
        key={`radar-line-${path}`}
        d={path}
        fill="none"
        stroke="var(--gold)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="1"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="1"
          to="0"
          dur="780ms"
          fill="freeze"
          calcMode="spline"
          keyTimes="0;1"
          keySplines="0.2 0.8 0.2 1"
        />
      </path>
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="0" fill="var(--gold)" opacity="0">
          <animate
            attributeName="r"
            from="0"
            to="3.5"
            dur="240ms"
            begin={`${220 + i * 55}ms`}
            fill="freeze"
          />
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="180ms"
            begin={`${220 + i * 55}ms`}
            fill="freeze"
          />
        </circle>
      ))}
      {labels.map(([x, y, name], i) => (
        <text
          key={i}
          x={x as number}
          y={y as number}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fill="currentColor"
          className="font-mono"
        >
          {name as string}
        </text>
      ))}
    </svg>
  );
}

function RatingChart({ data }: { data: { date: string; rating: number }[] }) {
  const ratingData =
    data.length >= 2
      ? data
      : [
          { date: "Now", rating: data[0]?.rating ?? 0 },
          { date: "Now", rating: data[0]?.rating ?? 0 },
        ];
  const w = 600;
  const h = 180;
  const pad = 30;
  const max = Math.max(...ratingData.map((d) => d.rating)) + 20;
  const min = Math.min(...ratingData.map((d) => d.rating)) - 20;
  const range = max - min || 1;
  const pts = ratingData.map((d, i) => {
    const x = pad + (i / (ratingData.length - 1)) * (w - pad * 2);
    const y = h - pad - ((d.rating - min) / range) * (h - pad * 2);
    return { x, y, ...d };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id="ratingfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        key={`rating-fill-${path}`}
        d={`${path} L${pts[pts.length - 1].x},${h - pad} L${pts[0].x},${h - pad} Z`}
        fill="url(#ratingfill)"
        opacity="0"
      >
        <animate attributeName="opacity" from="0" to="1" dur="620ms" begin="160ms" fill="freeze" />
      </path>
      <path
        key={`rating-line-${path}`}
        d={path}
        fill="none"
        stroke="var(--gold)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="1"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="1"
          to="0"
          dur="900ms"
          fill="freeze"
          calcMode="spline"
          keyTimes="0;1"
          keySplines="0.2 0.8 0.2 1"
        />
      </path>
      {pts.map((p, i) => (
        <g key={`${p.date}-${i}`} opacity="0">
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="220ms"
            begin={`${260 + i * 65}ms`}
            fill="freeze"
          />
          <circle
            cx={p.x}
            cy={p.y}
            r="0"
            fill="var(--background)"
            stroke="var(--gold)"
            strokeWidth="2"
          >
            <animate
              attributeName="r"
              from="0"
              to="4"
              dur="220ms"
              begin={`${260 + i * 65}ms`}
              fill="freeze"
            />
          </circle>
          <text
            x={p.x}
            y={h - 8}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            className="font-mono opacity-60"
          >
            {p.date}
          </text>
          <text
            x={p.x}
            y={p.y - 12}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            className="font-mono"
          >
            {p.rating || "N/A"}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SkillsPage() {
  const conn = useConnection();
  const games = useGames();

  if (!conn || games.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Import games to estimate skills"
          description="Skill scores are computed from your game results, move counts, color performance, rating trend, and available accuracy data."
        />
      </div>
    );
  }

  const skills = computeSkills(games);
  const timeline = ratingTimeline(games);
  const sorted = [...skills].sort((a, b) => a.value - b.value);
  const weakest = sorted.slice(0, 2);
  const strongest = sorted.slice(-2).reverse();

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Improvement tracking"
        title="Skills & progress"
        description="Heuristic skill estimates from your imported games. These will get sharper as the analysis engine gets deeper."
      />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/40 p-6">
          <h3 className="font-display mb-1 text-lg font-semibold">Skill profile</h3>
          <p className="mb-4 text-xs text-muted-foreground">Six dimensions estimated from play</p>
          <RadarChart skills={skills} />
        </Card>

        <Card className="border-border/60 bg-card/40 p-6">
          <h3 className="font-display mb-1 text-lg font-semibold">Rating over time</h3>
          <p className="mb-4 text-xs text-muted-foreground">Latest monthly buckets</p>
          <RatingChart data={timeline} />
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="border-loss/20 bg-loss/[0.04] p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-loss" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-loss">
              Biggest weaknesses
            </span>
          </div>
          {weakest.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between border-t border-border/30 py-2 first:border-0"
            >
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-sm">{s.value}/100</span>
            </div>
          ))}
        </Card>

        <Card className="border-win/20 bg-win/[0.04] p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-win" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-win">
              Strengths
            </span>
          </div>
          {strongest.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between border-t border-border/30 py-2 first:border-0"
            >
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-sm">{s.value}/100</span>
            </div>
          ))}
        </Card>
      </div>

      <Card className="border-border/60 bg-card/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <h3 className="font-display text-lg font-semibold">All skills</h3>
        </div>
        <div className="space-y-4">
          {skills.map((s) => (
            <div key={s.name}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="font-mono text-muted-foreground">
                  {s.value}/100
                  <span className={s.delta >= 0 ? "ml-2 text-win" : "ml-2 text-loss"}>
                    {s.delta >= 0 ? "up" : "down"} {Math.abs(s.delta)}
                  </span>
                </span>
              </div>
              <Progress value={s.value} className="h-2" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
