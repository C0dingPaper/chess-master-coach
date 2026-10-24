import type { Puzzle } from "./types";

interface PuzzleBucket {
  rating: number;
  count: number;
  url: string;
}

interface PuzzleManifest {
  version: string;
  source: string;
  sourceUrl: string;
  license: string;
  generatedAt: string;
  minRating: number;
  maxRating: number;
  bucketSize: 100;
  buckets: PuzzleBucket[];
}

export interface CollectionPuzzles {
  puzzles: Puzzle[];
  baseRating: number;
  manifestVersion: string;
}

// Cache completed, validated reads only. One caller's abort must not poison a
// later attempt or cancel a different caller's download.
let cachedManifest: PuzzleManifest | null = null;
const cachedBuckets = new Map<string, Puzzle[]>();
const uciMove = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Puzzle loading was cancelled.", "AbortError");
}

async function readJson(url: string, signal?: AbortSignal): Promise<unknown> {
  checkAbort(signal);
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Could not load the puzzle collection (${response.status}). Please try again.`);
  }
  const data: unknown = await response.json();
  checkAbort(signal);
  return data;
}

function parseManifest(value: unknown): PuzzleManifest {
  const invalid = () => new Error("The puzzle catalogue is invalid. Please reload and try again.");
  if (
    !record(value) ||
    typeof value.version !== "string" ||
    value.version.length === 0 ||
    typeof value.source !== "string" ||
    typeof value.sourceUrl !== "string" ||
    typeof value.license !== "string" ||
    typeof value.generatedAt !== "string" ||
    !integer(value.minRating) ||
    !integer(value.maxRating) ||
    value.minRating < 0 ||
    value.maxRating < value.minRating + 200 ||
    value.minRating % 100 !== 0 ||
    value.maxRating % 100 !== 0 ||
    value.bucketSize !== 100 ||
    !Array.isArray(value.buckets)
  ) {
    throw invalid();
  }

  const buckets: PuzzleBucket[] = [];
  const ratings = new Set<number>();
  for (const bucket of value.buckets) {
    if (
      !record(bucket) ||
      !integer(bucket.rating) ||
      bucket.rating < value.minRating ||
      bucket.rating > value.maxRating ||
      bucket.rating % 100 !== 0 ||
      ratings.has(bucket.rating) ||
      !integer(bucket.count) ||
      bucket.count < 1 ||
      typeof bucket.url !== "string" ||
      !/^\/puzzles\/[a-zA-Z0-9_/-]+\.json$/.test(bucket.url)
    ) {
      throw invalid();
    }
    ratings.add(bucket.rating);
    buckets.push({ rating: bucket.rating, count: bucket.count, url: bucket.url });
  }
  for (let rating = value.minRating; rating <= value.maxRating; rating += 100) {
    if (!ratings.has(rating)) throw invalid();
  }
  return {
    version: value.version,
    source: value.source,
    sourceUrl: value.sourceUrl,
    license: value.license,
    generatedAt: value.generatedAt,
    minRating: value.minRating,
    maxRating: value.maxRating,
    bucketSize: 100,
    buckets,
  };
}

async function loadManifest(signal?: AbortSignal): Promise<PuzzleManifest> {
  checkAbort(signal);
  if (cachedManifest) return cachedManifest;
  const manifest = parseManifest(await readJson("/puzzles/manifest.json", signal));
  cachedManifest = manifest;
  return manifest;
}

function parsePuzzles(value: unknown, bucket: PuzzleBucket): Puzzle[] {
  const invalid = () =>
    new Error("Some puzzles could not be loaded correctly. Please reload and try again.");
  if (!Array.isArray(value) || value.length !== bucket.count) throw invalid();
  const ids = new Set<string>();
  const puzzles: Puzzle[] = [];
  for (const puzzle of value) {
    if (
      !record(puzzle) ||
      typeof puzzle.id !== "string" ||
      puzzle.id.length === 0 ||
      ids.has(puzzle.id) ||
      typeof puzzle.fen !== "string" ||
      puzzle.fen.trim().split(/\s+/).length !== 6 ||
      !Array.isArray(puzzle.moves) ||
      puzzle.moves.length < 2 ||
      !puzzle.moves.every((move: unknown) => typeof move === "string" && uciMove.test(move)) ||
      !integer(puzzle.rating) ||
      Math.round(puzzle.rating / 100) * 100 !== bucket.rating ||
      !Array.isArray(puzzle.themes) ||
      !puzzle.themes.every((theme: unknown) => typeof theme === "string") ||
      typeof puzzle.gameUrl !== "string" ||
      !/^https:\/\/lichess\.org\//.test(puzzle.gameUrl)
    ) {
      throw invalid();
    }
    ids.add(puzzle.id);
    puzzles.push({
      id: puzzle.id,
      fen: puzzle.fen,
      moves: [...puzzle.moves],
      rating: puzzle.rating,
      themes: [...puzzle.themes],
      gameUrl: puzzle.gameUrl,
    });
  }
  return puzzles;
}

async function loadBucket(
  manifest: PuzzleManifest,
  rating: number,
  signal?: AbortSignal,
): Promise<Puzzle[]> {
  checkAbort(signal);
  const bucket = manifest.buckets.find((candidate) => candidate.rating === rating);
  if (!bucket) throw new Error("Puzzles are not available for this rating yet.");
  const key = `${manifest.version}:${bucket.url}`;
  const cached = cachedBuckets.get(key);
  if (cached) return cached;
  const puzzles = parsePuzzles(await readJson(bucket.url, signal), bucket);
  cachedBuckets.set(key, puzzles);
  return puzzles;
}

function normalizeRating(rating: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(rating)) throw new Error("Choose a valid puzzle rating to begin training.");
  return Math.min(maximum, Math.max(minimum, Math.round(rating / 100) * 100));
}

export async function loadCollectionPuzzles(
  requestedRating: number,
  signal?: AbortSignal,
): Promise<CollectionPuzzles> {
  const manifest = await loadManifest(signal);
  const baseRating = normalizeRating(requestedRating, manifest.minRating, manifest.maxRating - 200);
  const buckets = await Promise.all(
    [baseRating, baseRating + 100, baseRating + 200].map((rating) =>
      loadBucket(manifest, rating, signal),
    ),
  );
  checkAbort(signal);
  if (buckets.some((bucket, index) => bucket.length < [500, 300, 200][index])) {
    throw new Error(
      "There are not enough puzzles to create your full collection. Please try again.",
    );
  }
  const puzzles = buckets.flat();
  if (new Set(puzzles.map((puzzle) => puzzle.id)).size !== puzzles.length) {
    throw new Error("The puzzle collection contains duplicates. Please reload and try again.");
  }
  return { puzzles, baseRating, manifestVersion: manifest.version };
}

export async function loadCalibrationPuzzle(
  targetRating: number,
  excludedIds: readonly string[] | ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<Puzzle> {
  const manifest = await loadManifest(signal);
  const rating = normalizeRating(targetRating, manifest.minRating, manifest.maxRating);
  const excluded = new Set(excludedIds);
  const puzzles = await loadBucket(manifest, rating, signal);
  checkAbort(signal);
  const candidates = puzzles.filter((puzzle) => !excluded.has(puzzle.id));
  if (candidates.length === 0) {
    throw new Error("No new calibration puzzles are available for this rating. Please try again.");
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
