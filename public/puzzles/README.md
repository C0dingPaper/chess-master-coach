# Training puzzle catalog

These are real puzzles from the [Lichess open puzzle database](https://database.lichess.org/#puzzles), released by Lichess under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The catalog can be used and redistributed, including commercially. Source game links and original Lichess puzzle IDs are retained.

The app serves these local JSON assets; solving a puzzle does not make a live request to Lichess. Only the rating buckets needed for a user's collection need to be fetched.

## Contents and rating bands

`manifest.json` lists the available rating buckets, their counts, paths, and SHA-256 checksums. Each `<rating>.json` is an array of puzzles with this shape:

```ts
{
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  gameUrl: string;
}
```

There are 600 puzzles per 100-point bucket, from 400 through 3000. Each bucket contains ratings from its center minus 50 to its center plus 49. For example, bucket 1500 covers 1450–1549. This supports a 1,000-puzzle collection containing 500 at the base target, 300 at base +100, and 200 at base +200 for base targets up to 2800. Puzzle ratings are Lichess puzzle ratings, not playing ratings.

The importer requires popularity of at least 80 and at least 100 recorded plays. It excludes duplicate IDs and duplicate positions after the setup move, and validates every full move sequence with `chess.js`. Selection takes the first qualifying records in database order, which makes the selection reproducible for a given export; it does not claim a statistically random sample of the full database.

## Important solution convention

Lichess's FEN is **before the opponent's setup move**. Apply `moves[0]` before presenting the position to the user. The user's first solution move is `moves[1]`; later moves alternate opponent and user. Moves use UCI notation, including a fifth character for promotions. Lichess specifically permits any checkmating move as a correct answer when there are alternative mates in one.

Themes are useful for mixing the collection but should stay hidden during an attempt, because they can reveal the solution.

## Refresh the catalog

Install the application's Node dependencies first. The importer also needs `curl` and `zstd` (`sudo pacman -S zstd` on Arch Linux, if missing).

```bash
curl --fail --location --output /tmp/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
node scripts/import-lichess-puzzles.mjs /tmp/lichess_db_puzzle.csv.zst
node scripts/import-lichess-puzzles.mjs --validate
```

An uncompressed `.csv` path also works. The full download is hundreds of megabytes; it is intentionally kept outside the repository. Importing streams decompressed rows and stops once all buckets are full. The resulting bundled subset is a few megabytes. The script fails without replacing the catalog if the source cannot fill every bucket. The original export contains additional columns that this application does not need; columns are matched by header name so new trailing columns are safe.

The official export is updated over time, so rerunning against a newer source can select different puzzles and ratings. Preserve users' saved collection contents rather than silently rebuilding an in-progress cycle when updating these assets.
