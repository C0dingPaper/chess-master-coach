import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, ArrowRight, Download, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/chess-board";
import { authorizeExplorer, explorerToken, lookupExplorer } from "@/lib/chess/lichess-explorer";
import {
  generateRepertoire,
  identifyVariation,
  type OpeningReference,
  loadOpeningReferences,
  resolveOpening,
  REPERTOIRE_PLIES,
  REPERTOIRE_VARIATIONS,
} from "@/lib/chess/repertoire-generator";
import { getPinned, putGeneratedRepertoire, putPinned } from "@/lib/chess/storage";
import { pgnToSanMoves } from "@/lib/chess/pgn";
import { newCard } from "@/lib/chess/srs";
import type { Color, RepertoireLine, StoredGame } from "@/lib/chess/types";
import { toast } from "sonner";

export function RepertoireBuilder({
  name,
  eco,
  color,
  games,
  owner,
  savedLines = [],
}: {
  name: string;
  eco: string;
  color: Color;
  games: StoredGame[];
  owner: string;
  savedLines?: RepertoireLine[];
}) {
  const [rawLines, setLines] = useState<RepertoireLine[]>(savedLines);
  const [references, setReferences] = useState<OpeningReference[]>([]);
  const [referenceError, setReferenceError] = useState("");
  useEffect(() => {
    let mounted = true;
    void loadOpeningReferences().then(
      (entries) => {
        if (mounted) setReferences(entries);
      },
      () => {
        if (mounted)
          setReferenceError(
            "Variation names could not be loaded. Reopen this repertoire to retry.",
          );
      },
    );
    return () => {
      mounted = false;
    };
  }, []);
  const lines = useMemo(
    () =>
      rawLines.map((line) => {
        const match = identifyVariation(references, line.pgn);
        return {
          ...line,
          name: match?.name ?? line.generated?.openingName ?? line.name,
          eco: match?.eco ?? line.eco,
        };
      }),
    [rawLines, references],
  );
  const [active, setActive] = useState(0);
  const [ply, setPly] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(savedLines.length > 0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [connected, setConnected] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setConnected(Boolean(explorerToken()));
    return () => controller.current?.abort();
  }, []);
  const current = lines[active];
  const replay = useMemo(() => {
    const board = new Chess();
    if (current) board.loadPgn(current.pgn);
    const moves = board.history();
    board.reset();
    const positions = [board.fen()];
    for (const move of moves) {
      board.move(move);
      positions.push(board.fen());
    }
    return { moves, positions };
  }, [current]);

  useEffect(() => {
    if (!replay.moves.length) return;
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [role='combobox'], [role='textbox']"))
      )
        return;
      const last = replay.moves.length;
      switch (event.key) {
        case "ArrowLeft":
          setPly((value) => Math.max(0, value - 1));
          break;
        case "ArrowRight":
          setPly((value) => Math.min(last, value + 1));
          break;
        case "ArrowUp":
          setPly(1);
          break;
        case "ArrowDown":
          setPly(last);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [replay.moves.length]);

  const variationLabels = useMemo(() => {
    const histories = lines.map((line) => pgnToSanMoves(line.pgn));
    let common = 0;
    while (
      histories.length > 1 &&
      common < 32 &&
      histories.every((moves) => moves[common] === histories[0][common])
    )
      common++;
    return histories.map((moves) =>
      moves
        .slice(common, common + 6)
        .map((move, index) => {
          const at = common + index;
          return `${at % 2 === 0 ? `${at / 2 + 1}. ` : index === 0 ? `${Math.floor(at / 2) + 1}… ` : ""}${move}`;
        })
        .join(" "),
    );
  }, [lines]);

  async function generate() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setProgress(0);
    setStatus("Finding the opening position…");
    try {
      const references = await loadOpeningReferences();
      abort.signal.throwIfAborted();
      setReferences(references);
      setReferenceError("");
      const stored = savedLines[0]?.generated;
      const root = stored
        ? references.find(
            (entry) => entry.pgn === stored.openingPgn && entry.eco === stored.openingEco,
          )
        : resolveOpening(references, games, name, eco);
      if (!root)
        throw new Error(
          "This opening reference is unavailable. Generate again from your imported opening.",
        );
      const generated = await generateRepertoire(
        root,
        color,
        lookupExplorer,
        abort.signal,
        (update) => {
          setProgress(update.ply);
          setStatus(
            `Building move ${Math.min(16, Math.floor(update.ply / 2) + 1)} of 16 · ${update.positions} positions loaded`,
          );
        },
      );
      abort.signal.throwIfAborted();
      if (!generated.length)
        throw new Error(
          "Lichess did not have enough continuation data to reach move 16 for this opening. Try another opening.",
        );
      const groupId = `${owner}:${color}:${root.fen}`;
      const next = generated.map(
        (line, index): RepertoireLine => ({
          id: `generated:${groupId}:${index}`,
          name: `${root.name} · Variation ${index + 1}`,
          color,
          eco: root.eco,
          pgn: line.pgn,
          note: "Common continuations from rated Lichess blitz, rapid and classical games. Responses follow the most played move; these lines have not been engine evaluated.",
          createdAt: Date.now(),
          generated: {
            groupId,
            owner,
            openingName: root.name,
            openingPgn: root.pgn,
            openingEco: root.eco,
            source: "lichess-explorer",
            variation: index + 1,
            minGames: line.minGames,
          },
        }),
      );
      setLines(next);
      setActive(0);
      setPly(root.plies);
      setSaved(false);
      setStatus(
        next.length === REPERTOIRE_VARIATIONS
          ? "All 10 variations reach move 16."
          : `Only ${next.length} complete variations were available. Each reaches move 16.`,
      );
    } catch (cause) {
      if (abort.signal.aborted)
        setStatus("Generation cancelled. Loaded positions are cached for your next attempt.");
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not generate this repertoire. Please retry.",
        );
    } finally {
      setBusy(false);
      setConnected(Boolean(explorerToken()));
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await putGeneratedRepertoire(lines);
      setSaved(true);
      toast.success(`${lines.length} variations saved`);
    } catch {
      setError("Could not save the repertoire. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function download() {
    const safe = (value: string) => value.replace(/["\\\r\n]/g, " ");
    const content = lines
      .map(
        (line) =>
          `[Event "${safe(line.name)}"]\n[Source "Lichess Opening Explorer"]\n[ECO "${line.eco}"]\n[Result "*"]\n\n${line.pgn} *`,
      )
      .join("\n\n");
    const url = URL.createObjectURL(new Blob([content], { type: "application/x-chess-pgn" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${color}.pgn`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function addTraining() {
    setSaving(true);
    setError("");
    try {
      const existing = new Set(
        (await getPinned()).map(
          (card) => `${card.fen.split(" ").slice(0, 4).join(" ")}:${card.myMove}`,
        ),
      );
      let count = 0;
      for (const line of lines) {
        const chess = new Chess();
        chess.loadPgn(line.pgn);
        const moves = chess.history();
        chess.reset();
        for (const move of moves) {
          if (chess.turn() === (color === "white" ? "w" : "b")) {
            const key = `${chess.fen().split(" ").slice(0, 4).join(" ")}:${move}`;
            if (!existing.has(key)) {
              await putPinned(
                newCard({
                  fen: chess.fen(),
                  myMove: move,
                  label: line.name,
                  note: line.note,
                  lineId: line.id,
                }),
              );
              existing.add(key);
              count++;
            }
          }
          chess.move(move);
        }
      }
      toast.success(
        count
          ? `${count} unique positions added to repertoire review`
          : "These positions are already in your training queue",
      );
    } catch {
      setError("Some training positions could not be saved. Retry to add the remaining positions.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
        <p className="font-semibold">10 variations · 16 full moves · Play as {color}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Common opponent replies from Lichess, with one consistent response for you. Each line
          includes the opening moves and ends after Black’s 16th move.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!connected ? (
            <Button
              onClick={() =>
                void authorizeExplorer().catch(() =>
                  setError("Could not connect to Lichess. Please retry."),
                )
              }
            >
              Connect Lichess explorer
            </Button>
          ) : (
            <Button disabled={busy || saving} onClick={() => void generate()}>
              <Sparkles className="mr-2 h-4 w-4" />
              {lines.length ? "Regenerate variations" : "Generate repertoire"}
            </Button>
          )}
          {busy && (
            <Button variant="outline" onClick={() => controller.current?.abort()}>
              Cancel generation
            </Button>
          )}
        </div>
        {!connected && (
          <p className="mt-2 text-xs text-muted-foreground">
            Lichess requires a connection to access its explorer. Your authorization lasts for this
            browser tab.
          </p>
        )}
        {busy && (
          <div className="mt-4 space-y-2" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status}
            </p>
            <progress
              aria-label="Repertoire generation progress"
              className="h-2 w-full accent-[var(--accent)]"
              max={REPERTOIRE_PLIES}
              value={progress}
            />
            <p className="text-xs text-muted-foreground">
              The first generation can take several minutes. Positions are cached to speed up later
              attempts.
            </p>
          </div>
        )}
        {!busy && status && (
          <p role="status" className="mt-3 text-sm">
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {current && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {lines.length}/10 variations · 16 full moves each {saved && "· Saved"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={saving || busy || saved} onClick={() => void save()}>
                <Save className="mr-2 h-4 w-4" />
                {saved ? "Saved" : "Save repertoire"}
              </Button>
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="mr-2 h-4 w-4" />
                PGN
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!saved || busy || saving}
                onClick={() => void addTraining()}
              >
                Add to training
              </Button>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <ChessBoard
                options={{
                  id: "generated-repertoire",
                  position: replay.positions[Math.min(ply, replay.moves.length)],
                  boardOrientation: color,
                  allowDrawingArrows: true,
                  allowDragging: false,
                }}
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button
                  aria-label="Previous move"
                  variant="outline"
                  size="sm"
                  disabled={ply === 0}
                  onClick={() => setPly((p) => Math.max(0, p - 1))}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setPly(0)}
                >
                  Reset board
                </button>
                <span className="text-xs">
                  {ply === 0 ? "Starting position" : `Move ${Math.ceil(ply / 2)} of 16`}
                </span>
                <Button
                  aria-label="Next move"
                  variant="outline"
                  size="sm"
                  disabled={ply === replay.moves.length}
                  onClick={() => setPly((p) => Math.min(replay.moves.length, p + 1))}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                ← Previous · → Next · ↑ First move · ↓ Last move
              </p>
            </div>
            <div className="min-w-0 space-y-4">
              <label className="block text-sm font-medium">
                Variation
                <select
                  className="mt-2 w-full rounded-md border border-input bg-background p-2"
                  value={active}
                  onChange={(event) => {
                    setActive(Number(event.target.value));
                    setPly(0);
                  }}
                >
                  {lines.map((line, index) => (
                    <option key={line.id} value={index}>
                      {index + 1}. {line.name} · {variationLabels[index]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm font-semibold leading-relaxed">{current.name}</p>
              {referenceError && (
                <p role="status" className="text-xs text-muted-foreground">
                  {referenceError}
                </p>
              )}
              <div
                className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-3"
                aria-label="Variation moves"
              >
                {replay.moves.map((move, index) => (
                  <button
                    key={index}
                    aria-label={`Go to move ${Math.floor(index / 2) + 1}${index % 2 === 0 ? "." : "..."} ${move}`}
                    aria-pressed={ply === index + 1}
                    onClick={() => setPly(index + 1)}
                    className={`rounded px-2 py-1 font-mono text-xs ${ply === index + 1 ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                  >
                    {index % 2 === 0 ? `${index / 2 + 1}. ` : ""}
                    {move}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Smallest continuation sample: {current.generated?.minGames.toLocaleString()} games.
                Popularity is not an engine evaluation.
              </p>
              <p className="text-xs text-muted-foreground">
                Source:{" "}
                <a
                  className="underline"
                  href="https://lichess.org/analysis"
                  target="_blank"
                  rel="noreferrer"
                >
                  Lichess Opening Explorer
                </a>{" "}
                · Rated blitz, rapid and classical games.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
