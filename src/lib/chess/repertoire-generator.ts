import { Chess } from "chess.js";
import type { Color, StoredGame } from "./types.ts";

export const REPERTOIRE_VARIATIONS = 10;
export const REPERTOIRE_PLIES = 32;
export interface OpeningReference {
  eco: string;
  name: string;
  pgn: string;
  fen: string;
  plies: number;
}
export interface BookMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
}
export interface BookPosition {
  moves: BookMove[];
  white: number;
  draws: number;
  black: number;
}
export interface GeneratedVariation {
  pgn: string;
  moves: string[];
  probability: number;
  minGames: number;
}
export type BookLookup = (fen: string, signal: AbortSignal) => Promise<BookPosition>;
export const positionKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
let referencePromise: Promise<OpeningReference[]> | undefined;
export function loadOpeningReferences() {
  return (referencePromise ??= fetch("/openings/lichess.json")
    .then(async (response) => {
      if (!response.ok) throw new Error("The opening reference could not be loaded. Please retry.");
      return (await response.json()) as OpeningReference[];
    })
    .catch((error) => {
      referencePromise = undefined;
      throw error;
    }));
}

const referenceIndexes = new WeakMap<OpeningReference[], Map<string, OpeningReference>>();

/** Use the most specific named position reached anywhere along the line. */
export function identifyVariation(references: OpeningReference[], pgn: string) {
  let index = referenceIndexes.get(references);
  if (!index) {
    index = new Map();
    for (const entry of references) {
      const key = positionKey(entry.fen);
      const previous = index.get(key);
      if (
        !previous ||
        entry.plies > previous.plies ||
        (entry.plies === previous.plies && entry.name.length > previous.name.length)
      ) {
        index.set(key, entry);
      }
    }
    referenceIndexes.set(references, index);
  }
  const board = new Chess();
  board.loadPgn(pgn);
  const history = board.history();
  board.reset();
  let match: OpeningReference | undefined;
  for (const move of history) {
    board.move(move);
    const candidate = index.get(positionKey(board.fen()));
    if (candidate && (!match || candidate.plies >= match.plies)) match = candidate;
  }
  return match;
}

/** Match actual board positions, including transpositions, instead of guessing from a preview. */
export function resolveOpening(
  references: OpeningReference[],
  games: StoredGame[],
  name: string,
  eco: string,
) {
  const counts = new Map<string, number>();
  for (const game of games) {
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn, { strict: false });
      const moves = chess.history();
      chess.reset();
      const seen = new Set<string>();
      for (const move of moves.slice(0, REPERTOIRE_PLIES)) {
        chess.move(move);
        seen.add(positionKey(chess.fen()));
      }
      for (const fen of seen) counts.set(fen, (counts.get(fen) ?? 0) + 1);
    } catch {
      /* Ignore malformed imported games. */
    }
  }
  const matching = references.filter((entry) => counts.has(entry.fen));
  const named = matching.filter((entry) => normalize(entry.name) === normalize(name));
  const coded = matching.filter((entry) => entry.eco === eco);
  const candidates = named.length ? named : coded.length ? coded : matching;
  const root = [...candidates].sort(
    (a, b) => counts.get(b.fen)! - counts.get(a.fen)! || b.plies - a.plies,
  )[0];
  if (!root) throw new Error("No matching opening position was found in these games.");
  if (root.plies >= REPERTOIRE_PLIES)
    throw new Error(
      "This named opening already reaches move 16. Choose an earlier opening to generate continuations.",
    );
  return root;
}

const moveCount = (move: BookMove) => move.white + move.draws + move.black;

/** Collect frequent early opponent branches, then extend each with a book main line.
 * Only opponent turns branch; our side always plays the most frequent book move.
 * The fixed 32-ply boundary counts the opening prefix and is independent of engine depth.
 */
export async function generateRepertoire(
  root: OpeningReference,
  color: Color,
  lookup: BookLookup,
  signal: AbortSignal,
  report?: (progress: { ply: number; positions: number; lines: number }) => void,
): Promise<GeneratedVariation[]> {
  const initial = new Chess();
  initial.loadPgn(root.pgn);
  if (initial.history().length >= REPERTOIRE_PLIES)
    throw new Error("The opening must begin before move 16.");
  let beam: GeneratedVariation[] = [
    { pgn: root.pgn, moves: initial.history(), probability: 1, minGames: Infinity },
  ];
  let positions = 0;
  const policy = new Map<string, string>();
  for (let ply = initial.history().length; ply < REPERTOIRE_PLIES && beam.length; ply++) {
    // Once ten early variations are established, preserve their coverage instead of
    // replacing them with ten tiny differences near the end of a single main line.
    const next: GeneratedVariation[] = [];
    for (const line of beam) {
      signal.throwIfAborted();
      const board = new Chess();
      board.loadPgn(line.pgn);
      if (board.isGameOver()) continue;
      const book = await lookup(board.fen(), signal);
      positions++;
      const legal = new Set(
        board.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? "")),
      );
      const moves = book.moves
        .filter((move) => legal.has(move.uci) && moveCount(move) > 0)
        .sort((a, b) => moveCount(b) - moveCount(a) || a.uci.localeCompare(b.uci));
      const ownTurn = board.turn() === (color === "white" ? "w" : "b");
      const key = positionKey(board.fen());
      if (ownTurn && moves.length && !policy.has(key)) policy.set(key, moves[0].uci);
      const choices = ownTurn
        ? moves.filter((move) => move.uci === policy.get(key)).slice(0, 1)
        : beam.length < REPERTOIRE_VARIATIONS
          ? moves
          : moves.slice(0, 1);
      const total = Math.max(
        book.white + book.draws + book.black,
        moves.reduce((sum, m) => sum + moveCount(m), 0),
      );
      for (const move of choices) {
        const played = board.move({
          from: move.uci.slice(0, 2),
          to: move.uci.slice(2, 4),
          promotion: move.uci[4],
        });
        next.push({
          pgn: board.pgn(),
          moves: [...line.moves, played.san],
          probability: line.probability * (ownTurn ? 1 : moveCount(move) / total),
          minGames: Math.min(line.minGames, moveCount(move)),
        });
        board.undo();
      }
      report?.({ ply, positions, lines: beam.length });
    }
    const distinct = new Map(next.map((line) => [line.moves.join(" "), line]));
    beam = [...distinct.values()]
      .sort((a, b) => b.probability - a.probability || a.pgn.localeCompare(b.pgn))
      .slice(0, REPERTOIRE_VARIATIONS);
    report?.({ ply: ply + 1, positions, lines: beam.length });
  }
  // Short database continuations never masquerade as completed sixteen-move lines.
  return beam.filter((line) => line.moves.length === REPERTOIRE_PLIES);
}
