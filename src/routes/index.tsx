import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ChessPositionPreview } from "@/components/chess-board";
import {
  ArrowRight,
  Check,
  Swords,
  GitBranch,
  BookMarked,
  Brain,
  ScanLine,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeverPay4Chess — Free chess improvement, forever" },
      {
        name: "description",
        content:
          "Import your games, explore your openings, build a repertoire, and make practice part of your day. Your free chess improvement workspace.",
      },
      { property: "og:title", content: "NeverPay4Chess — Free chess improvement, forever" },
      {
        property: "og:description",
        content:
          "A focused workspace for your games, opening repertoire, analysis, and daily chess practice.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Swords,
    title: "Your games, together",
    desc: "Import from Chess.com or Lichess. Review your history, filter results, and export your PGNs.",
  },
  {
    icon: GitBranch,
    title: "Understand your openings",
    desc: "Explore the moves you actually play and see how each branch performs in your games.",
  },
  {
    icon: BookMarked,
    title: "A repertoire that is yours",
    desc: "Save your preferred lines, add notes, and organize the positions you want to remember.",
  },
  {
    icon: Brain,
    title: "Practice with a purpose",
    desc: "Turn saved positions into spaced repetition sessions and keep your opening knowledge fresh.",
  },
  {
    icon: ScanLine,
    title: "Learn from your games",
    desc: "Replay your moves, analyze positions, and revisit the moments that deserve another look.",
  },
  {
    icon: TrendingUp,
    title: "See your progress",
    desc: "Follow your rating, results, and estimated skill profile to find a useful focus for practice.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Logo />
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex"
          >
            <a href="#features" className="transition-colors hover:text-foreground">
              The workspace
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#manifesto" className="transition-colors hover:text-foreground">
              Our approach
            </a>
          </nav>
          <Button asChild className="shrink-0 bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/app">
              Open app <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-20 lg:py-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/5 px-3 py-1.5 text-xs font-semibold text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Your free chess workspace
            </div>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.1] tracking-[-0.045em] sm:text-5xl xl:text-[64px]">
              Every game is a chance to <span className="text-accent">get better.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Bring your games, openings, and practice into one focused workspace. Find your next
              move forward.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 bg-accent px-6 text-accent-foreground hover:bg-accent/90"
              >
                <Link to="/app">
                  Start improving <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 bg-white px-6">
                <a href="#features">Explore the workspace</a>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {["Chess.com & Lichess", "No subscription", "No account required"].map((label) => (
                <span key={label} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="mx-auto w-full max-w-[490px] rounded-2xl border border-border bg-white p-4 shadow-[0_16px_48px_-24px_rgba(27,39,48,0.22)] sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="section-kicker mb-1 text-muted-foreground">Opening explorer</div>
                <h2 className="text-base font-semibold">The Italian Game</h2>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                Example position
              </span>
            </div>
            <ChessPositionPreview
              position="r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
              showNotation
              label="Italian Game after 1. e4 e5 2. Nf3 Nc6 3. Bc4"
              className="overflow-hidden rounded-lg"
            />
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-background px-3 py-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <span className="text-muted-foreground">1.</span>
                <span className="font-medium">e4 e5</span>
                <span className="ml-1 text-muted-foreground">2.</span>
                <span className="font-medium">Nf3 Nc6</span>
                <span className="ml-1 text-muted-foreground">3.</span>
                <span className="font-semibold text-accent">Bc4</span>
              </div>
              <GitBranch className="h-4 w-4 shrink-0 text-accent" />
            </div>
          </div>
        </section>
        <section id="features" className="border-y border-border bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
              <div>
                <div className="section-kicker mb-3 text-accent">A more focused way to improve</div>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Your next move starts here.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                From the first move to the post-game review, keep your chess learning in one place.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-border p-6">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/8 text-accent">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="how" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="section-kicker mb-3 text-accent">Make progress a habit</div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            A simple rhythm. A stronger game.
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-12">
            {[
              {
                n: "01",
                title: "Bring your games",
                desc: "Enter your Chess.com or Lichess username to import your public game history.",
              },
              {
                n: "02",
                title: "Find your focus",
                desc: "Explore your openings, review a recent game, and save the lines you want to learn.",
              },
              {
                n: "03",
                title: "Put it into practice",
                desc: "Revisit saved positions with focused training. Return to your games and see what changes.",
              },
            ].map((step) => (
              <div key={step.n} className="border-t border-border pt-6">
                <span className="text-xs font-semibold text-accent">{step.n}</span>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
        <section id="manifesto" className="border-t border-border bg-[#edf4f0]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-5 py-12 sm:px-8 sm:py-16">
            <div className="max-w-2xl">
              <div className="section-kicker mb-3 text-accent">NeverPay4Chess</div>
              <h2 className="text-3xl font-semibold tracking-tight">
                More learning. No subscription.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                We believe useful chess tools should be accessible. Your games, your repertoire, and
                your practice — free to explore.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="h-12 bg-accent px-6 text-accent-foreground hover:bg-accent/90"
            >
              <Link to="/app">
                Open your workspace <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-7 sm:px-8">
          <Logo />
          <p className="text-xs text-muted-foreground">
            © 2026 NeverPay4Chess. Made for the love of the game.
          </p>
        </div>
      </footer>
    </div>
  );
}
