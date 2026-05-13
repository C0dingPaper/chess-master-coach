import { openDB, type IDBPDatabase } from "idb";
import type { Connection, PinnedPosition, RepertoireLine, StoredGame } from "./types";

const DB_NAME = "neverpay4chess";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") return null as unknown as Promise<IDBPDatabase>;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
  notify();
}

// ---------- Games ----------
export async function putGames(games: StoredGame[]) {
  const db = await getDb();
  if (!db) return;
  const tx = db.transaction("games", "readwrite");
  for (const g of games) await tx.store.put(g);
  await tx.done;
  notify();
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
  notify();
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
  notify();
}

export async function deleteRepertoire(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete("repertoire", id);
  notify();
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
  notify();
}

export async function deletePinned(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete("pinned", id);
  notify();
}

// ---------- Reactivity ----------
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const l of listeners) l();
}
