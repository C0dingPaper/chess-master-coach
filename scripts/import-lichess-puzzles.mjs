#!/usr/bin/env node

// Import a small, validated subset of Lichess's CC0 puzzle database.
// Usage: node scripts/import-lichess-puzzles.mjs /path/to/lichess_db_puzzle.csv.zst
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/puzzles");
const sourceUrl = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const countPerBucket = 600;
const minimumRating = 400;
const maximumRating = 3000;
const minimumPopularity = 80;
const minimumPlays = 100;
const requiredFields = [
  "PuzzleId",
  "FEN",
  "Moves",
  "Rating",
  "Popularity",
  "NbPlays",
  "Themes",
  "GameUrl",
];

// Handles quoted fields and escaped quotes; Lichess rows contain no embedded newlines.
function csvRow(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error("Unterminated CSV field");
  values.push(value);
  return values;
}

function validatePuzzle(puzzle) {
  if (!/^[a-zA-Z0-9]+$/.test(puzzle.id) || !Number.isInteger(puzzle.rating)) {
    throw new Error("Invalid puzzle ID or rating");
  }
  if (puzzle.moves.length < 2 || puzzle.moves.length % 2 !== 0) {
    throw new Error("A solution must include a setup move and finish on the player's move");
  }
  if (!puzzle.gameUrl.startsWith("https://lichess.org/")) {
    throw new Error("Invalid source game URL");
  }
  const game = new Chess(puzzle.fen);
  let position;
  for (const [index, uci] of puzzle.moves.entries()) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      throw new Error(`Invalid UCI move ${uci}`);
    }
    game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (index === 0) position = game.fen().split(" ").slice(0, 4).join(" ");
  }
  return position;
}

async function validateCatalog() {
  const manifest = JSON.parse(await readFile(resolve(output, "manifest.json"), "utf8"));
  const ids = new Set();
  const positions = new Set();
  for (const bucket of manifest.buckets) {
    const raw = await readFile(resolve(root, "public", bucket.url.replace(/^\//, "")), "utf8");
    const puzzles = JSON.parse(raw);
    if (puzzles.length !== bucket.count || puzzles.length < 500) {
      throw new Error(`Bucket ${bucket.rating} has an incorrect or insufficient puzzle count`);
    }
    if (createHash("sha256").update(raw).digest("hex") !== bucket.sha256) {
      throw new Error(`Bucket ${bucket.rating} checksum does not match`);
    }
    for (const puzzle of puzzles) {
      if (Math.round(puzzle.rating / 100) * 100 !== bucket.rating) {
        throw new Error(`Puzzle ${puzzle.id} is in the wrong rating bucket`);
      }
      const position = validatePuzzle(puzzle);
      if (ids.has(puzzle.id) || positions.has(position)) {
        throw new Error(`Duplicate puzzle or starting position: ${puzzle.id}`);
      }
      ids.add(puzzle.id);
      positions.add(position);
    }
  }
  if (ids.size !== manifest.totalPuzzles) throw new Error("Manifest total does not match catalog");
  console.log(
    `Validated ${ids.size.toLocaleString()} unique puzzles and all solution moves across ${manifest.buckets.length} rating buckets.`,
  );
}

async function importCatalog(inputPath) {
  if (!inputPath) {
    throw new Error(
      "Usage: node scripts/import-lichess-puzzles.mjs <export.csv.zst|export.csv> | --validate",
    );
  }
  const buckets = new Map();
  for (let rating = minimumRating; rating <= maximumRating; rating += 100) buckets.set(rating, []);
  const ids = new Set();
  const positions = new Set();
  const compressed = inputPath.endsWith(".zst");
  const decoder = compressed
    ? spawn("zstd", ["--decompress", "--stdout", "--quiet", "--", resolve(inputPath)])
    : null;
  const stream = decoder ? decoder.stdout : createReadStream(resolve(inputPath));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let decoderError = "";
  let decoderDone;
  if (decoder) {
    decoder.stderr.on("data", (chunk) => {
      decoderError += chunk.toString();
    });
    decoderDone = new Promise((complete, reject) => {
      decoder.once("error", (error) => {
        stream.destroy(error);
        reject(error);
      });
      decoder.once("close", (code, signal) => complete({ code, signal }));
    });
    // Attach immediately so a missing zstd executable cannot create an unhandled rejection.
    decoderDone.catch(() => {});
  }
  let columns;
  let scanned = 0;
  let invalid = 0;
  let complete = false;
  try {
    for await (const line of lines) {
      if (!line) continue;
      const fields = csvRow(line);
      if (!columns) {
        columns = Object.fromEntries(
          fields.map((name, index) => [name.replace(/^\uFEFF/, ""), index]),
        );
        for (const name of requiredFields) {
          if (columns[name] === undefined) throw new Error(`Missing CSV column ${name}`);
        }
        continue;
      }
      scanned += 1;
      const rating = Number(fields[columns.Rating]);
      const bucket = buckets.get(Math.round(rating / 100) * 100);
      if (!bucket || bucket.length >= countPerBucket) continue;
      if (
        Number(fields[columns.Popularity]) < minimumPopularity ||
        Number(fields[columns.NbPlays]) < minimumPlays
      )
        continue;
      const puzzle = {
        id: fields[columns.PuzzleId],
        fen: fields[columns.FEN],
        moves: fields[columns.Moves].trim().split(/\s+/),
        rating,
        themes: fields[columns.Themes].trim().split(/\s+/).filter(Boolean),
        gameUrl: fields[columns.GameUrl],
      };
      if (ids.has(puzzle.id)) continue;
      let position;
      try {
        position = validatePuzzle(puzzle);
      } catch {
        invalid += 1;
        continue;
      }
      if (positions.has(position)) continue;
      ids.add(puzzle.id);
      positions.add(position);
      bucket.push(puzzle);
      if (ids.size % 3000 === 0)
        console.log(
          `Selected ${ids.size.toLocaleString()} puzzles from ${scanned.toLocaleString()} rows.`,
        );
      if ([...buckets.values()].every((items) => items.length >= countPerBucket)) {
        complete = true;
        break;
      }
    }
  } finally {
    lines.close();
    stream.destroy();
    if (decoder) {
      if (complete) decoder.kill("SIGTERM");
      const result = await decoderDone;
      if (!complete && result.code !== 0)
        throw new Error(`zstd failed: ${decoderError || result.signal || result.code}`);
    }
  }

  const shortfalls = [...buckets].filter(([, items]) => items.length < countPerBucket);
  if (shortfalls.length) {
    throw new Error(
      `Not enough qualifying puzzles; catalog was not overwritten. ${shortfalls.map(([rating, items]) => `${rating}: ${items.length}/${countPerBucket}`).join(", ")}`,
    );
  }

  await mkdir(output, { recursive: true });
  const manifestBuckets = [];
  for (const [rating, puzzles] of buckets) {
    const raw = `${JSON.stringify(puzzles)}\n`;
    await writeFile(resolve(output, `${rating}.json`), raw);
    manifestBuckets.push({
      rating,
      count: puzzles.length,
      url: `/puzzles/${rating}.json`,
      sha256: createHash("sha256").update(raw).digest("hex"),
    });
  }
  const manifest = {
    version: "lichess-training-v1",
    source: "Lichess open puzzle database",
    sourceUrl,
    documentationUrl: "https://database.lichess.org/#puzzles",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    generatedAt: new Date().toISOString(),
    minRating: minimumRating,
    maxRating: maximumRating,
    bucketSize: 100,
    totalPuzzles: ids.size,
    filters: {
      minimumPopularity,
      minimumPlays,
      uniqueStartingPositions: true,
      legalSolutions: true,
    },
    selection: {
      method: "First qualifying records in source order",
      rowsScanned: scanned,
      invalidRowsSkipped: invalid,
    },
    buckets: manifestBuckets,
  };
  await writeFile(resolve(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Imported ${ids.size.toLocaleString()} puzzles into ${output}.`);
}

try {
  if (process.argv[2] === "--validate") await validateCatalog();
  else await importCatalog(process.argv[2]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
