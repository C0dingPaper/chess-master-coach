import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { skills, ratingHistory } from "@/lib/mock-data";
import { TrendingUp, TrendingDown, Target } from "lucide-react";

export const Route = createFileRoute("/app/skills")({
  head: () => ({ meta: [{ title: "Skills · NeverPay4Chess" }] }),
  component: SkillsPage,
});

function RadarChart() {
  const cx = 150, cy = 150, r = 110;
  const n = skills.length;
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
    <svg viewBox="0 0 300 300" className="w-full max-w-md mx-auto">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={skills.map((_, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            return `${cx + Math.cos(angle) * r * f},${cy + Math.sin(angle) * r * f}`;
          }).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      {skills.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r} stroke="var(--border)" strokeWidth="1" />;
      })}
      <path d={path} fill="var(--gold)" fillOpacity="0.2" stroke="var(--gold)" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="var(--gold)" />)}
      {labels.map(([x, y, name], i) => (
        <text key={i} x={x as number} y={y as number} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="currentColor" className="font-mono">
          {name as string}
        </text>
      ))}
    </svg>
  );
}

function RatingChart() {
  const w = 600, h = 180, pad = 30;
  const max = Math.max(...ratingHistory.map((d) => d.rating)) + 20;
  const min = Math.min(...ratingHistory.map((d) => d.rating)) - 20;
  const range = max - min;
  const pts = ratingHistory.map((d, i) => {
    const x = pad + (i / (ratingHistory.length - 1)) * (w - pad * 2);
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
      <path d={`${path} L${pts[pts.length - 1].x},${h - pad} L${pts[0].x},${h - pad} Z`} fill="url(#ratingfill)" />
      <path d={path} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="var(--background)" stroke="var(--gold)" strokeWidth="2" />
          <text x={p.x} y={h - 8} textAnchor="middle" fontSize="11" fill="currentColor" className="font-mono opacity-60">{p.date}</text>
          <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="11" fill="currentColor" className="font-mono">{p.rating}</text>
        </g>
      ))}
    </svg>
  );
}

function SkillsPage() {
  const sorted = [...skills].sort((a, b) => a.value - b.value);
  const weakest = sorted.slice(0, 2);
  const strongest = sorted.slice(-2).reverse();

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Improvement tracking"
        title="Skills & progress"
        description="Where you're strong, where you're leaking points, and where to focus this week."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6 border-border/60 bg-card/40">
          <h3 className="font-display text-lg font-semibold mb-1">Skill profile</h3>
          <p className="text-xs text-muted-foreground mb-4">Six dimensions of your chess</p>
          <RadarChart />
        </Card>

        <Card className="p-6 border-border/60 bg-card/40">
          <h3 className="font-display text-lg font-semibold mb-1">Rating over time</h3>
          <p className="text-xs text-muted-foreground mb-4">Last 5 months</p>
          <RatingChart />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-5 border-border/60 bg-loss/[0.04] border-loss/20">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-loss" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-loss">Biggest weaknesses</span>
          </div>
          {weakest.map((s) => (
            <div key={s.name} className="flex justify-between items-center py-2 border-t border-border/30 first:border-0">
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-sm">{s.value}/100</span>
            </div>
          ))}
        </Card>

        <Card className="p-5 border-border/60 bg-win/[0.04] border-win/20">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-win" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-win">Strengths</span>
          </div>
          {strongest.map((s) => (
            <div key={s.name} className="flex justify-between items-center py-2 border-t border-border/30 first:border-0">
              <span className="font-medium">{s.name}</span>
              <span className="font-mono text-sm">{s.value}/100</span>
            </div>
          ))}
        </Card>
      </div>

      <Card className="p-5 border-border/60 bg-card/40">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-accent" />
          <h3 className="font-display text-lg font-semibold">All skills</h3>
        </div>
        <div className="space-y-4">
          {skills.map((s) => (
            <div key={s.name}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium">{s.name}</span>
                <span className="font-mono text-muted-foreground">
                  {s.value}/100
                  <span className={s.delta >= 0 ? "text-win ml-2" : "text-loss ml-2"}>
                    {s.delta >= 0 ? "↑" : "↓"} {Math.abs(s.delta)}
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
