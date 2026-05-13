import { buildStoredGame } from "./pgn";
import type { Platform, StoredGame } from "./types";

export interface ImportProgress {
  fetched: number;
  parsed: number;
  total: number | null;
  status: string;
}

type Reporter = (p: ImportProgress) => void;

export interface ImportResult {
  games: StoredGame[];
  errors: string[];
}

// ---------- Chess.com ----------
export async function importChessCom(username: string, maxMonths = 6, report?: Reporter): Promise<ImportResult> {
  const errors: string[] = [];
  report?.({ fetched: 0, parsed: 0, total: null, status: "Fetching archives…" });

  const archivesRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`);
  if (!archivesRes.ok) {
    throw new Error(
      archivesRes.status === 404
        ? `Chess.com user "${username}" not found.`
        : `Chess.com archives request failed (${archivesRes.status}).`,
    );
  }
  const { archives } = (await archivesRes.json()) as { archives: string[] };
  const recent = archives.slice(-maxMonths).reverse();

  const games: StoredGame[] = [];
  for (let i = 0; i < recent.length; i++) {
    const url = recent[i];
    report?.({ fetched: i, parsed: games.length, total: recent.length, status: `Fetching month ${i + 1}/${recent.length}…` });
    try {
      const res = await fetch(url);
      if (!res.ok) { errors.push(`Failed ${url}: ${res.status}`); continue; }
      const data = (await res.json()) as { games: ChessComGame[] };
      for (const g of data.games) {
        if (!g.pgn) continue;
        try {
          const id = g.url.split("/").pop() ?? `${g.end_time}`;
          const accuracy =
            g.white.username.toLowerCase() === username.toLowerCase()
              ? g.accuracies?.white ?? null
              : g.accuracies?.black ?? null;
          games.push(
            buildStoredGame({
              platform: "chess.com",
              gameId: id,
              url: g.url,
              pgn: g.pgn,
              username,
              accuracy: typeof accuracy === "number" ? Math.round(accuracy * 10) / 10 : null,
            }),
          );
        } catch (e) {
          errors.push(`Parse error: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      errors.push(`Network error on ${url}: ${(e as Error).message}`);
    }
  }
  report?.({ fetched: recent.length, parsed: games.length, total: recent.length, status: "Done" });
  return { games, errors };
}

interface ChessComGame {
  url: string;
  pgn: string;
  end_time: number;
  white: { username: string; rating: number };
  black: { username: string; rating: number };
  accuracies?: { white?: number; black?: number };
}

// ---------- Lichess ----------
export async function importLichess(username: string, max = 200, report?: Reporter): Promise<ImportResult> {
  const errors: string[] = [];
  report?.({ fetched: 0, parsed: 0, total: max, status: "Streaming PGNs from Lichess…" });

  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&pgnInJson=true&clocks=false&evals=false&opening=true`,
    { headers: { Accept: "application/x-ndjson" } },
  );
  if (!res.ok || !res.body) {
    throw new Error(
      res.status === 404
        ? `Lichess user "${username}" not found.`
        : `Lichess request failed (${res.status}).`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const games: StoredGame[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const g = JSON.parse(line) as LichessGame;
        if (!g.pgn) continue;
        games.push(
          buildStoredGame({
            platform: "lichess",
            gameId: g.id,
            url: `https://lichess.org/${g.id}`,
            pgn: g.pgn,
            username,
            accuracy: null,
          }),
        );
        if (games.length % 10 === 0) report?.({ fetched: games.length, parsed: games.length, total: max, status: "Streaming…" });
      } catch (e) {
        errors.push(`Parse error: ${(e as Error).message}`);
      }
    }
  }
  report?.({ fetched: games.length, parsed: games.length, total: max, status: "Done" });
  return { games, errors };
}

interface LichessGame {
  id: string;
  pgn?: string;
}

export async function importGames(platform: Platform, username: string, report?: Reporter): Promise<ImportResult> {
  if (platform === "chess.com") return importChessCom(username, 6, report);
  return importLichess(username, 200, report);
}
