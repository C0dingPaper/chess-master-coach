import { useSyncExternalStore } from "react";
import {
  getConnection,
  subscribe,
  getAllGames,
  getRepertoire,
  getPinned,
  type ChessStore,
} from "./storage";
import type { Connection, PinnedPosition, RepertoireLine, StoredGame } from "./types";

type DataStatus = { loading: boolean; error: Error | null };
const INITIAL_STATUS: DataStatus = { loading: true, error: null };

/** One cached snapshot and one in-flight read per store, shared by every page. */
function createStore<T>(name: ChessStore, initial: T, fetcher: () => Promise<T>) {
  let value = initial;
  let status = INITIAL_STATUS;
  let dirty = true;
  let reading = false;
  let revision = 0;
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) listener();
  }

  async function refresh() {
    if (reading || !dirty || typeof window === "undefined") return;
    reading = true;

    // A mutation during a read invalidates its result. Read again instead of
    // publishing a stale snapshot over the user's latest changes.
    while (dirty) {
      const readRevision = revision;
      dirty = false;
      try {
        const next = await fetcher();
        if (readRevision !== revision) continue;
        value = next;
        status = { loading: false, error: null };
      } catch (error) {
        if (readRevision !== revision) continue;
        status = {
          loading: false,
          error: error instanceof Error ? error : new Error("Unable to load your chess data."),
        };
      }
      emit();
    }

    reading = false;
  }

  subscribe((changedStore) => {
    if (changedStore !== name) return;
    revision++;
    dirty = true;
    if (listeners.size > 0) void refresh();
  });

  return {
    getSnapshot: () => value,
    getServerSnapshot: () => initial,
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      void refresh();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const connectionStore = createStore<Connection | null>("connection", null, getConnection);
const gamesStore = createStore<StoredGame[]>("games", [], getAllGames);
const repertoireStore = createStore<RepertoireLine[]>("repertoire", [], getRepertoire);
const pinnedStore = createStore<PinnedPosition[]>("pinned", [], getPinned);

export function useConnection(): Connection | null {
  return useSyncExternalStore(
    connectionStore.subscribe,
    connectionStore.getSnapshot,
    connectionStore.getServerSnapshot,
  );
}

export function useGames(): StoredGame[] {
  return useSyncExternalStore(
    gamesStore.subscribe,
    gamesStore.getSnapshot,
    gamesStore.getServerSnapshot,
  );
}

export function useRepertoire(): RepertoireLine[] {
  return useSyncExternalStore(
    repertoireStore.subscribe,
    repertoireStore.getSnapshot,
    repertoireStore.getServerSnapshot,
  );
}

export function usePinned(): PinnedPosition[] {
  return useSyncExternalStore(
    pinnedStore.subscribe,
    pinnedStore.getSnapshot,
    pinnedStore.getServerSnapshot,
  );
}

const stores = [connectionStore, gamesStore, repertoireStore, pinnedStore];
let combinedStatus = INITIAL_STATUS;

function getDataStatus() {
  const statuses = stores.map((store) => store.getStatus());
  const loading = statuses.some((status) => status.loading);
  const error = statuses.find((status) => status.error)?.error ?? null;
  if (combinedStatus.loading !== loading || combinedStatus.error !== error) {
    combinedStatus = { loading, error };
  }
  return combinedStatus;
}

function subscribeToDataStatus(listener: () => void) {
  const unsubscribe = stores.map((store) => store.subscribe(listener));
  return () => unsubscribe.forEach((stop) => stop());
}

/** Warm local data once and avoid showing empty account states during hydration. */
export function useChessDataStatus(): DataStatus {
  return useSyncExternalStore(subscribeToDataStatus, getDataStatus, () => INITIAL_STATUS);
}

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// Hydration-safe SSR check with stable subscribe functions.
export function useIsClient() {
  return useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
}
