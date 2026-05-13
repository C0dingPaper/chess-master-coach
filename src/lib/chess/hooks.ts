import { useEffect, useState, useSyncExternalStore } from "react";
import { getConnection, subscribe, getAllGames, getRepertoire, getPinned } from "./storage";
import type { Connection, PinnedPosition, RepertoireLine, StoredGame } from "./types";

function useStore<T>(initial: T, fetcher: () => Promise<T>) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      fetcher().then((v) => {
        if (!cancelled) setValue(v);
      });
    refresh();
    const unsub = subscribe(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

export function useConnection(): Connection | null {
  return useStore<Connection | null>(null, getConnection);
}

export function useGames(): StoredGame[] {
  return useStore<StoredGame[]>([], getAllGames);
}

export function useRepertoire(): RepertoireLine[] {
  return useStore<RepertoireLine[]>([], getRepertoire);
}

export function usePinned(): PinnedPosition[] {
  return useStore<PinnedPosition[]>([], getPinned);
}

// Hydration-safe SSR check
export function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
