import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Check,
  Swords,
  GitBranch,
  BookMarked,
  Brain,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Github,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeverPay4Chess — Free chess improvement, forever" },
      {
        name: "description",
        content:
          "Import your games, build your opening repertoire, train with spaced repetition, and learn from every mistake. Free, forever.",
      },
      { property: "og:title", content: "NeverPay4Chess — Free chess improvement, forever" },
      {
        property: "og:description",
        content:
          "The chess trainer that imports your games, builds your personal opening tree, and explains every mistake. Free, forever.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Swords,
    title: "Import every game",
    desc: "Pull your full history from Chess.com and Lichess. One click, no account required.",
  },
  {
    icon: GitBranch,
    title: "Your opening tree",
    desc: "See exactly what you play, win rates per move, and which lines are leaking points.",
  },
  {
    icon: BookMarked,
    title: "Build a repertoire",
    desc: "Choose your move in critical positions. Save notes. Label lines. Make it yours.",
  },
  {
    icon: Brain,
    title: "Spaced repetition",
    desc: "Drill positions until they're automatic. Cards you miss come back sooner.",
  },
  {
    icon: AlertTriangle,
    title: "Coach explains mistakes",
    desc: "Plain-English breakdowns of every blunder, with the better move you should have played.",
  },
  {
    icon: TrendingUp,
    title: "Track all your skills",
    desc: "Openings, tactics, positional, endgames, defense, time management. See where to focus.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition">
              Features
            </a>
            <a href="#how" className="hover:text-foreground transition">
              How it works
            </a>
            <a href="#manifesto" className="hover:text-foreground transition">
              Manifesto
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href="https://github.com" target="_blank" rel="noreferrer">
                <Github className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link to="/app">
                Open app <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.78_0.16_75/0.10),transparent_60%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-24 md:pt-32 md:pb-36 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <Badge
              variant="outline"
              className="font-mono text-[10px] uppercase tracking-[0.2em] gap-2 px-3 py-1.5 border-accent/30 text-accent"
            >
              <Sparkles className="h-3 w-3" /> Free forever · No paywall, ever
            </Badge>
            <h1 className="mt-6 font-display text-5xl md:text-7xl font-semibold leading-[0.95] tracking-tight">
              The chess trainer
              <br />
              <span className="text-gradient-gold">that should always</span>
              <br />
              have been free.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
              Import your games. Build your repertoire. Train with spaced repetition. Get
              plain-English explanations for every mistake. No subscriptions. No "upgrade to see
              your weaknesses".
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 px-6 bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
              >
                <Link to="/app">
                  Open the dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-6">
                <a href="#features">See features</a>
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground font-mono">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-win" /> Chess.com
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-win" /> Lichess
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-win" /> Open source
              </span>
            </div>
          </div>

          {/* Visual: chess board with gold pieces */}
          <div className="lg:col-span-5 relative">
            <div className="relative aspect-square max-w-md mx-auto">
              <div className="absolute -inset-8 bg-accent/15 rounded-full blur-3xl" />
              <div className="relative bg-board rounded-2xl shadow-elegant grain overflow-hidden p-6 ring-1 ring-border/40">
                <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
                  <Badge className="bg-background/90 text-foreground border-border/50 font-mono text-[10px]">
                    After 3.Bc4 — Italian
                  </Badge>
                  <Badge className="bg-win/20 text-win border-win/40 font-mono text-[10px]">
                    71% win rate
                  </Badge>
                </div>
                <div className="absolute bottom-6 left-6 right-6 grid grid-cols-3 gap-2">
                  {[
                    { l: "Bc5", w: 78 },
                    { l: "Nf6", w: 64 },
                    { l: "Be7", w: 52 },
                  ].map((m) => (
                    <div
                      key={m.l}
                      className="bg-background/90 backdrop-blur rounded-md p-2.5 border border-border/40"
                    >
                      <div className="font-mono text-xs font-semibold">{m.l}</div>
                      <div className="text-[10px] text-muted-foreground">{m.w}% wins</div>
                      <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-win" style={{ width: `${m.w}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid place-items-center h-full text-9xl opacity-30 font-display select-none">
                  ♞
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              Everything you need
            </div>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-semibold tracking-tight">
              The whole improvement loop. In one place.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Other tools lock the good stuff behind premium tiers. We don't. Connect your account
              and go.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border/60 rounded-xl overflow-hidden">
            {features.map((f) => (
              <div key={f.title} className="bg-background p-7 hover:bg-card/60 transition group">
                <div className="h-10 w-10 rounded-md bg-accent/10 text-accent grid place-items-center mb-5 group-hover:bg-accent group-hover:text-accent-foreground transition">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-xl font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-24 border-t border-border/40 bg-card/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            How it works
          </div>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-semibold tracking-tight">
            Three steps. No friction.
          </h2>

          <div className="mt-12 space-y-px bg-border/60 rounded-xl overflow-hidden">
            {[
              {
                n: "01",
                t: "Type your username",
                d: "Chess.com or Lichess. We pull every game you've played — public history is free for everyone.",
              },
              {
                n: "02",
                t: "We build your map",
                d: "Your opening tree, your win rates, your weakest skills, and your most common mistakes — automatically.",
              },
              {
                n: "03",
                t: "Train what matters",
                d: "Daily spaced-repetition cards on the positions that lose you points. Improve where it actually counts.",
              },
            ].map((s) => (
              <div key={s.n} className="bg-background p-8 flex items-start gap-8">
                <div className="font-mono text-3xl font-semibold text-accent shrink-0 w-16">
                  {s.n}
                </div>
                <div>
                  <h3 className="font-display text-2xl font-semibold">{s.t}</h3>
                  <p className="mt-2 text-muted-foreground max-w-2xl">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section id="manifesto" className="py-24 border-t border-border/40">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            Manifesto
          </div>
          <h2 className="mt-4 font-display text-4xl md:text-6xl font-semibold tracking-tight leading-tight">
            "Your improvement <span className="text-gradient-gold italic">isn't</span> a
            subscription."
          </h2>
          <p className="mt-8 text-lg text-muted-foreground max-w-2xl mx-auto">
            Chess is 1500 years old. The idea that you should pay $14/month to see which openings
            you lose with is absurd. We built NeverPay4Chess because the tools to get better should
            be a right, not a recurring charge.
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="h-12 px-6 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link to="/app">
                Start improving — for free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <div className="text-xs text-muted-foreground font-mono">
            © 2026 NeverPay4Chess · Free as in freedom · Built by people who got tired of paywalls
          </div>
        </div>
      </footer>
    </div>
  );
}
