import { openDB, type IDBPDatabase } from "idb";
import type { Connection, PinnedPosition, RepertoireLine, StoredGame } from "./types";
import type { BookPosition } from "./repertoire-generator";

const DB_NAME = "neverpay4chess";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") return null as unknown as Promise<IDBPDatabase>;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("explorer")) {
          const explorer = db.createObjectStore("explorer", { keyPath: "key" });
          explorer.createIndex("savedAt", "savedAt");
        }
        if (!db.objectStoreNames.contains("games")) {
          const games = db.createObjectStore("games", { keyPath: "id" });
          games.createIndex("endTime", "endTime");
          games.createIndex("platform", "platform");
        }
        if (!db.objectStoreNames.contains("repertoire")) {
          db.createObjectStore("repertoire", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pinned")) {
          const pinned = db.createObjectStore("pinned", { keyPath: "id" });
          pinned.createIndex("due", "due");
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      },
    }).catch((error) => {
      // Allow later reads to retry a temporarily unavailable database.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

// ---------- Connection (stored in kv) ----------
const CONN_KEY = "connection";

export async function getConnection(): Promise<Connection | null> {
  const db = await getDb();
  if (!db) return null;
  return (await db.get("kv", CONN_KEY)) ?? null;
}

export async function setConnection(c: Connection | null) {
  const db = await getDb();
  if (!db) return;
  if (c) await db.put("kv", c, CONN_KEY);
  else await db.delete("kv", CONN_KEY);
  notify("connection");
}

// ---------- Games ----------
export async function putGames(games: StoredGame[]) {
  if (games.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const tx = db.transaction("games", "readwrite");
  // Queue all writes together instead of serializing IndexedDB round trips.
  await Promise.all([...games.map((game) => tx.store.put(game)), tx.done]);
  notify("games");
}

export async function getAllGames(): Promise<StoredGame[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.getAll("games");
  return (all as StoredGame[]).sort((a, b) => b.endTime - a.endTime);
}

export async function getGameById(id: string): Promise<StoredGame | null> {
  const db = await getDb();
  if (!db) return null;
  return (await db.get("games", id)) ?? null;
}

export async function clearGames() {
  const db = await getDb();
  if (!db) return;
  await db.clear("games");
  notify("games");
}

// ---------- Repertoire ----------
export async function getRepertoire(): Promise<RepertoireLine[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.getAll("repertoire");
  return (all as RepertoireLine[]).sort((a, b) => b.createdAt - a.createdAt);
}

export async function putRepertoire(r: RepertoireLine) {
  const db = await getDb();
  if (!db) return;
  await db.put("repertoire", r);
  notify("repertoire");
}

/** Replace only this generated group, atomically; handwritten lines are untouched. */
export async function putGeneratedRepertoire(lines: RepertoireLine[]) {
  if (!lines.length || !lines[0].generated) return;
  const groupId = lines[0].generated.groupId;
  if (lines.some((line) => line.generated?.groupId !== groupId))
    throw new Error("Invalid repertoire group.");
  const db = await getDb();
  const tx = db.transaction("repertoire", "readwrite");
  const previous = (await tx.store.getAll()) as RepertoireLine[];
  for (const line of previous)
    if (line.generated?.groupId === groupId) await tx.store.delete(line.id);
  for (const line of lines) await tx.store.put(line);
  await tx.done;
  notify("repertoire");
}

export async function getExplorerCache(key: string): Promise<BookPosition | null> {
  const db = await getDb();
  const cached = await db.get("explorer", key);
  return cached && Date.now() - cached.savedAt < 7 * 86400_000 ? cached.data : null;
}

export async function putExplorerCache(key: string, data: BookPosition) {
  const db = await getDb();
  const tx = db.transaction("explorer", "readwrite");
  await tx.store.put({ key, data, savedAt: Date.now() });
  let excess = (await tx.store.count()) - 2500;
  let cursor = excess > 0 ? await tx.store.index("savedAt").openCursor() : null;
  while (cursor && excess-- > 0) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteRepertoire(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete("repertoire", id);
  notify("repertoire");
}

// ---------- Pinned positions / SRS ----------
export async function getPinned(): Promise<PinnedPosition[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.getAll("pinned")) as PinnedPosition[];
}

export async function putPinned(p: PinnedPosition) {
  const db = await getDb();
  if (!db) return;
  await db.put("pinned", p);
  notify("pinned");
}

export async function deletePinned(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete("pinned", id);
  notify("pinned");
}

// ---------- Reactivity ----------
export type ChessStore = "connection" | "games" | "repertoire" | "pinned";
type Listener = (store: ChessStore) => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(store: ChessStore) {
  for (const listener of listeners) listener(store);
}
