import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames } from "@/lib/chess/hooks";
import { computeSkills, ratingTimeline } from "@/lib/chess/stats";
import { ArrowRight, ArrowUpRight, Info, Target, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/skills")({
  head: () => ({ meta: [{ title: "Skills - NeverPay4Chess" }] }),
  component: SkillsPage,
});

type Skill = { name: string; value: number; delta: number };
const skillLabel = (name: string) => (name === "Time Mgmt" ? "Time management" : name);

function RadarChart({ skills }: { skills: Skill[] }) {
  const cx = 200;
  const cy = 162;
  const radius = 108;
  const n = skills.length || 1;
  const coordinate = (index: number, distance: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance };
  };
  const points = skills.map((skill, index) => coordinate(index, (skill.value / 100) * radius));
  return (
    <svg
      viewBox="0 0 400 325"
      role="img"
      aria-label={`Skill estimates: ${skills.map((skill) => `${skillLabel(skill.name)} ${skill.value} out of 100`).join(", ")}`}
      className="mx-auto w-full max-w-[400px]"
    >
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <polygon
          key={fraction}
          points={skills
            .map((_, index) => {
              const point = coordinate(index, radius * fraction);
              return `${point.x},${point.y}`;
            })
            .join(" ")}
          fill={fraction === 1 ? "var(--background)" : "none"}
          fillOpacity={fraction === 1 ? 0.35 : 1}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      {skills.map((_, index) => {
        const point = coordinate(index, radius);
        return (
          <line key={index} x1={cx} y1={cy} x2={point.x} y2={point.y} stroke="var(--border)" />
        );
      })}
      <polygon
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="var(--accent)"
        fillOpacity="0.12"
        stroke="var(--accent)"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      {points.map((point, index) => (
        <circle
          key={skills[index].name}
          cx={point.x}
          cy={point.y}
          r="4"
          fill="var(--accent)"
          stroke="white"
          strokeWidth="2"
        />
      ))}
      {skills.map((skill, index) => {
        const point = coordinate(index, radius + 31);
        return (
          <text
            key={skill.name}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="500"
            fill="var(--muted-foreground)"
          >
            {skillLabel(skill.name)}
          </text>
        );
      })}
    </svg>
  );
}

function RatingChart({ data }: { data: { date: string; rating: number }[] }) {
  if (!data.length)
    return (
      <div className="flex min-h-60 items-center justify-center rounded-lg bg-background text-sm text-muted-foreground">
        No rating data in your imported games yet.
      </div>
    );
  const width = 640;
  const height = 250;
  const left = 48;
  const right = width - 28;
  const top = 30;
  const bottom = height - 38;
  const highest = Math.max(...data.map((point) => point.rating));
  const lowest = Math.min(...data.map((point) => point.rating));
  const padding = Math.max(20, Math.ceil((highest - lowest) * 0.2));
  const min = Math.max(0, Math.floor((lowest - padding) / 20) * 20);
  const max = Math.ceil((highest + padding) / 20) * 20;
  const range = max - min || 1;
  const points = data.map((point, index) => ({
    ...point,
    x: data.length === 1 ? (left + right) / 2 : left + (index / (data.length - 1)) * (right - left),
    y: bottom - ((point.rating - min) / range) * (bottom - top),
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Monthly average rating: ${data.map((point) => `${point.date} ${point.rating}`).join(", ")}`}
      className="w-full"
    >
      {[0, 1, 2, 3].map((index) => {
        const y = top + (index / 3) * (bottom - top);
        return (
          <g key={index}>
            <line x1={left} y1={y} x2={right} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
            <text
              x={left - 10}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {Math.round(max - (index / 3) * range)}
            </text>
          </g>
        );
      })}
      {points.length > 1 && (
        <path
          d={`${path} L${points[points.length - 1].x},${bottom} L${points[0].x},${bottom} Z`}
          fill="var(--accent)"
          fillOpacity="0.06"
        />
      )}
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      {points.map((point, index) => (
        <g key={`${point.date}-${index}`}>
          <circle
            cx={point.x}
            cy={point.y}
            r="4"
            fill="white"
            stroke="var(--accent)"
            strokeWidth="2"
          />
          <text
            x={point.x}
            y={height - 12}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted-foreground)"
          >
            {point.date}
          </text>
          <text
            x={point.x}
            y={point.y - 13}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="var(--foreground)"
          >
            {point.rating}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SkillsPage() {
  const conn = useConnection();
  const games = useGames();
  const skills = useMemo(() => computeSkills(games), [games]);
  const timeline = useMemo(() => ratingTimeline(games), [games]);
  const sorted = useMemo(() => [...skills].sort((a, b) => a.value - b.value), [skills]);
  const weakest = sorted.slice(0, 2);
  const strongest = sorted.slice(-2).reverse();
  const latestRating = timeline[timeline.length - 1]?.rating;
  const ratingChange = timeline.length > 1 ? latestRating! - timeline[0].rating : null;

  if (!conn || games.length === 0) {
    return (
      <div className="app-page">
        <PageHeader
          eyebrow="Your development"
          title="Skills & progress"
          description="Build a clearer picture of your strengths and your next focus."
        />
        <EmptyConnect
          title="See your progress take shape"
          description="Import your games to explore your rating trend and skill estimates based on results, game length, and available accuracy data."
        />
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Your development"
        title="Skills & progress"
        description="See what is working, find your next focus, and keep improving."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/train">
              Start a session
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        }
      />
      <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-border bg-white px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Skill scores are estimates from your results, game length, ratings, and available accuracy
          data. Use them as a starting point for practice.
        </p>
      </div>
      <div className="mb-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="surface-card gap-0 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Skill profile</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Six areas of your game, scored out of 100
          </p>
          <RadarChart skills={skills} />
        </Card>
        <Card className="surface-card flex flex-col gap-0 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Rating over time</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Monthly averages from your imported games
              </p>
            </div>
            <span className="rounded-md bg-background px-2 py-1 text-[11px] text-muted-foreground">
              Last {timeline.length || 0} months
            </span>
          </div>
          {latestRating != null && (
            <div className="mb-4 mt-7 flex items-baseline gap-3">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {latestRating.toLocaleString()}
              </span>
              {ratingChange !== null && (
                <span
                  className={`text-xs font-medium ${ratingChange >= 0 ? "text-win" : "text-loss"}`}
                >
                  {ratingChange > 0 ? "+" : ""}
                  {ratingChange} over period
                </span>
              )}
            </div>
          )}
          <div className="my-auto">
            <RatingChart data={timeline} />
          </div>
        </Card>
      </div>
      <div className="mb-6 grid gap-5 md:grid-cols-2">
        <Card className="surface-card gap-0 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-md bg-[#fbf3e9] p-2 text-[#a66a26]">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Your next focus</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Areas with the most room to improve
              </p>
            </div>
          </div>
          {weakest.map((skill) => (
            <div
              key={skill.name}
              className="flex items-center justify-between border-t border-border/70 py-3 last:pb-0"
            >
              <span className="text-sm font-medium">{skillLabel(skill.name)}</span>
              <span className="text-sm tabular-nums">
                {skill.value}
                <span className="ml-0.5 text-xs text-muted-foreground">/ 100</span>
              </span>
            </div>
          ))}
        </Card>
        <Card className="surface-card gap-0 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-md bg-accent/8 p-2 text-accent">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Build on your strengths</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The strongest areas in your current profile
              </p>
            </div>
          </div>
          {strongest.map((skill) => (
            <div
              key={skill.name}
              className="flex items-center justify-between border-t border-border/70 py-3 last:pb-0"
            >
              <span className="text-sm font-medium">{skillLabel(skill.name)}</span>
              <span className="text-sm tabular-nums">
                {skill.value}
                <span className="ml-0.5 text-xs text-muted-foreground">/ 100</span>
              </span>
            </div>
          ))}
        </Card>
      </div>
      <Card className="surface-card gap-0 p-5 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">A closer look</h2>
          <span className="text-xs text-muted-foreground">Estimated score & change</span>
        </div>
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {skills.map((skill) => (
            <div key={skill.name}>
              <div className="mb-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{skillLabel(skill.name)}</span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground">
                    {skill.value}
                    <span className="text-xs"> / 100</span>
                  </span>
                  <span
                    className={`inline-flex min-w-10 items-center justify-end text-xs font-medium ${skill.delta > 0 ? "text-win" : skill.delta < 0 ? "text-loss" : "text-muted-foreground"}`}
                    aria-label={
                      skill.delta === 0
                        ? "No change"
                        : `${skill.delta > 0 ? "Up" : "Down"} ${Math.abs(skill.delta)}`
                    }
                  >
                    {skill.delta !== 0 && (
                      <ArrowUpRight
                        className={`mr-0.5 h-3.5 w-3.5 ${skill.delta < 0 ? "rotate-90" : ""}`}
                      />
                    )}
                    {skill.delta === 0 ? "—" : Math.abs(skill.delta)}
                  </span>
                </div>
              </div>
              <Progress
                value={skill.value}
                aria-label={`${skillLabel(skill.name)}: ${skill.value} out of 100`}
                className="h-1.5"
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
