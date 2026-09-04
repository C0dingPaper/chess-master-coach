import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyConnect } from "@/components/empty-connect";
import { useConnection, useGames, useIsClient, useRepertoire } from "@/lib/chess/hooks";
import { putRepertoire } from "@/lib/chess/storage";
import type { Color, RepertoireLine, StoredGame } from "@/lib/chess/types";
import { ArrowRight, BookOpen, Plus, Sparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

export const Route = createFileRoute("/app/repertoire")({
  head: () => ({ meta: [{ title: "Repertoire - NeverPay4Chess" }] }),
  component: RepertoirePage,
});

type OpeningCard = {
  id: string;
  name: string;
  family: string;
  eco: string;
  color: Color;
  moves: string;
  description: string;
  fen: string;
  totalLines: number;
  progress: number;
  gamesPlayed?: number;
  colorGames?: number;
  scorePct?: number;
  custom?: boolean;
};

type OpeningGroup = {
  name: string;
  eco: string;
  games: StoredGame[];
};

function formatMoveLine(moves: string[]) {
  const turns: string[] = [];
  for (let index = 0; index < moves.length; index += 2) {
    const moveNumber = index / 2 + 1;
    turns.push(`${moveNumber}. ${moves[index]}${moves[index + 1] ? ` ${moves[index + 1]}` : ""}`);
  }
  return turns.join(" ");
}

function previewFromGame(game: StoredGame) {
  try {
    const source = new Chess();
    source.loadPgn(game.pgn, { strict: false });
    const moves = source.history().slice(0, 8);
    if (moves.length === 0) throw new Error("No moves in game");
    const preview = new Chess();
    for (const move of moves) preview.move(move);
    return { moves: formatMoveLine(moves), fen: preview.fen() };
  } catch {
    return { moves: "Moves unavailable", fen: new Chess().fen() };
  }
}

function buildPersonalOpenings(games: StoredGame[], color: Color): OpeningCard[] {
  const colorGames = games.filter((game) => game.myColor === color);
  const groups = new Map<string, OpeningGroup>();

  for (const game of colorGames) {
    const name = game.opening.trim() || "Unknown opening";
    const eco = game.eco.trim() || "ECO";
    const key = `${name.toLocaleLowerCase()}\u0000${eco.toLocaleUpperCase()}`;
    const group = groups.get(key);
    if (group) group.games.push(game);
    else groups.set(key, { name, eco, games: [game] });
  }

  return Array.from(groups.values())
    .sort((a, b) => {
      const gamesDifference = b.games.length - a.games.length;
      if (gamesDifference !== 0) return gamesDifference;

      const points = (group: OpeningGroup) =>
        group.games.reduce(
          (total, game) => total + (game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0),
          0,
        ) / group.games.length;
      const scoreDifference = points(b) - points(a);
      if (scoreDifference !== 0) return scoreDifference;
      return (
        Math.max(...b.games.map((game) => game.endTime)) -
        Math.max(...a.games.map((game) => game.endTime))
      );
    })
    .slice(0, 3)
    .map((group, index) => {
      const representative = [...group.games].sort((a, b) => b.endTime - a.endTime)[0];
      const preview = previewFromGame(representative);
      const points = group.games.reduce(
        (total, game) => total + (game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0),
        0,
      );
      const scorePct = Math.round((points / group.games.length) * 100);
      const sharePct = Math.round((group.games.length / colorGames.length) * 100);
      const colorLabel = color === "white" ? "White" : "Black";

      return {
        id: `account-${color}-${index}-${group.eco}`,
        name: group.name,
        family: "From your games",
        eco: group.eco,
        color,
        moves: preview.moves,
        description: `You played this in ${group.games.length} of your ${colorGames.length} games as ${colorLabel}, scoring ${scorePct}%.`,
        fen: preview.fen,
        totalLines: 0,
        progress: sharePct,
        gamesPlayed: group.games.length,
        colorGames: colorGames.length,
        scorePct,
      };
    });
}

function positionFromMoves(moves: string) {
  try {
    const chess = new Chess();
    chess.loadPgn(moves);
    return chess.fen();
  } catch {
    return new Chess().fen();
  }
}

function OpeningTile({ opening, onClick }: { opening: OpeningCard; onClick: () => void }) {
  const isClient = useIsClient();
  const learnedLines = Math.round((opening.progress / 100) * opening.totalLines);
  const isAccountOpening = opening.gamesPlayed != null && opening.colorGames != null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative grid min-h-[248px] overflow-hidden rounded-xl border border-border/70 bg-card/50 p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:bg-card/70 hover:shadow-elegant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
      aria-label={`Open ${opening.name}`}
    >
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-border/60 bg-board shadow-sm sm:w-[180px]">
        {isClient ? (
          <Chessboard
            options={{
              id: `repertoire-${opening.id}`,
              position: opening.fen,
              boardOrientation: opening.color,
              allowDragging: false,
              allowDrawingArrows: false,
              showNotation: false,
              animationDurationInMs: 0,
              darkSquareStyle: { backgroundColor: "oklch(0.45 0.05 70)" },
              lightSquareStyle: { backgroundColor: "oklch(0.88 0.04 85)" },
              boardStyle: { width: "100%", height: "100%" },
            }}
          />
        ) : (
          <div className="bg-board h-full w-full" />
        )}
      </div>

      <div className="flex min-w-0 flex-col px-1 py-2 sm:px-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold leading-tight transition-colors group-hover:text-accent">
              {opening.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                {opening.eco}
              </Badge>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {opening.custom ? "Your line" : opening.family}
              </span>
            </div>
          </div>
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border font-display text-sm font-bold ${
              opening.color === "white"
                ? "border-foreground/15 bg-foreground text-background"
                : "border-border bg-background text-foreground"
            }`}
          >
            {opening.color === "white" ? "W" : "B"}
          </span>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {opening.description}
        </p>
        <p className="mt-2 truncate font-mono text-[11px] text-foreground/70">{opening.moves}</p>

        <div className="mt-auto pt-4">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px]">
            <span className="font-semibold text-foreground">
              {isAccountOpening
                ? `${opening.gamesPlayed} of ${opening.colorGames} games`
                : `Essentials · ${learnedLines}/${opening.totalLines}`}
            </span>
            <span className="text-muted-foreground">
              {isAccountOpening
                ? `${opening.scorePct}% score`
                : `${opening.totalLines} lines total`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full min-w-1 rounded-full bg-accent transition-all duration-500"
              style={{ width: `${Math.max(opening.progress, 1.5)}%` }}
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <span>
              {isAccountOpening
                ? "Explore this opening"
                : opening.progress === 0
                  ? "Try the first line"
                  : "Continue learning"}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:text-accent" />
          </div>
        </div>
      </div>
    </button>
  );
}

function AddLineDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<Color>("white");
  const [eco, setEco] = useState("");
  const [pgn, setPgn] = useState("");
  const [note, setNote] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPgn = pgn.trim();
    if (!trimmedName || !trimmedPgn) return;

    await putRepertoire({
      id: crypto.randomUUID(),
      name: trimmedName,
      color,
      eco: eco.trim().toUpperCase(),
      pgn: trimmedPgn,
      note: note.trim(),
      createdAt: Date.now(),
    });
    setName("");
    setEco("");
    setPgn("");
    setNote("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add your own line</DialogTitle>
          <DialogDescription>
            Save a personal opening line now. Training and spaced repetition will come later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="line-name">Opening name</Label>
            <Input
              id="line-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Italian Game line"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="line-color">Play as</Label>
              <select
                id="line-color"
                value={color}
                onChange={(event) => setColor(event.target.value as Color)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="line-eco">ECO code</Label>
              <Input
                id="line-eco"
                value={eco}
                onChange={(event) => setEco(event.target.value)}
                placeholder="C50"
                maxLength={3}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="line-pgn">Moves</Label>
            <Textarea
              id="line-pgn"
              value={pgn}
              onChange={(event) => setPgn(event.target.value)}
              placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4"
              className="min-h-24 font-mono"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="line-note">Note (optional)</Label>
            <Textarea
              id="line-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ideas or reminders for this line"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
              Save line
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PersonalOpeningSection({
  color,
  openings,
  username,
  onSelect,
}: {
  color: Color;
  openings: OpeningCard[];
  username: string;
  onSelect: (opening: OpeningCard) => void;
}) {
  const colorLabel = color === "white" ? "White" : "Black";

  return (
    <section
      className={color === "black" ? "mt-10" : undefined}
      aria-labelledby={`${color}-openings-title`}
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-accent">
            <Sparkles className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]">
              Personalized for {username}
            </span>
          </div>
          <h2 id={`${color}-openings-title`} className="font-display text-2xl font-semibold">
            Your top openings as {colorLabel}
          </h2>
        </div>
        <span className="hidden max-w-sm text-right text-xs text-muted-foreground sm:block">
          Up to three, ranked only from your imported games
        </span>
      </div>

      {openings.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {openings.map((opening) => (
            <OpeningTile key={opening.id} opening={opening} onClick={() => onSelect(opening)} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/20 p-6 text-sm text-muted-foreground">
          No imported games as {colorLabel} were found for this account.
        </div>
      )}
    </section>
  );
}

function RepertoirePage() {
  const conn = useConnection();
  const games = useGames();
  const repertoires = useRepertoire();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<OpeningCard | null>(null);

  const whiteOpenings = useMemo(() => buildPersonalOpenings(games, "white"), [games]);
  const blackOpenings = useMemo(() => buildPersonalOpenings(games, "black"), [games]);

  const customOpenings = useMemo(
    () =>
      repertoires.map<OpeningCard>((line: RepertoireLine) => ({
        id: line.id,
        name: line.name,
        family: "Personal repertoire",
        eco: line.eco || "ECO",
        color: line.color,
        moves: line.pgn,
        description: "A personal line saved to your repertoire.",
        fen: positionFromMoves(line.pgn),
        totalLines: 1,
        progress: 0,
        custom: true,
      })),
    [repertoires],
  );

  if (!conn) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Connect before building a repertoire"
          description="Imported games give the repertoire builder context about which openings you actually face."
        />
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <EmptyConnect
          title="Import games to personalize your repertoire"
          description="Your opening suggestions are built only from the connected account's own games. Import some games to see them."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Opening repertoire"
        title="Your personal opening preferences"
        description={`These suggestions come only from ${conn.username}'s ${conn.platform} games. They reflect what you choose to play, not global opening popularity.`}
        actions={
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-accent text-accent-foreground shadow-sm hover:bg-accent/90"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add new line
          </Button>
        }
      />

      <PersonalOpeningSection
        color="white"
        username={conn.username}
        openings={whiteOpenings}
        onSelect={setSelected}
      />
      <PersonalOpeningSection
        color="black"
        username={conn.username}
        openings={blackOpenings}
        onSelect={setSelected}
      />

      {customOpenings.length > 0 && (
        <section className="mt-10" aria-labelledby="your-lines-title">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            <h2 id="your-lines-title" className="font-display text-2xl font-semibold">
              Your lines
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {customOpenings.map((opening) => (
              <OpeningTile
                key={opening.id}
                opening={opening}
                onClick={() => setSelected(opening)}
              />
            ))}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="grid min-h-[218px] place-items-center rounded-xl border border-dashed border-border/70 bg-card/20 p-6 text-center text-muted-foreground transition hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
            >
              <span>
                <Plus className="mx-auto mb-3 h-6 w-6" />
                <span className="font-display text-lg font-semibold">Add another line</span>
              </span>
            </button>
          </div>
        </section>
      )}

      <AddLineDialog open={addOpen} onOpenChange={setAddOpen} />

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {selected?.eco}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] capitalize">
                As {selected?.color}
              </Badge>
            </div>
            <DialogTitle className="font-display text-3xl">{selected?.name}</DialogTitle>
            <DialogDescription className="font-mono">{selected?.moves}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/25 p-5 text-sm text-muted-foreground">
            {selected?.gamesPlayed != null
              ? selected.description
              : "Opening details, line building, and spaced-repetition training will be added in the next stage. For now, this card establishes the opening in your repertoire library."}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
