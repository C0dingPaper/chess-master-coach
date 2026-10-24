import type { BookPosition } from "./repertoire-generator.ts";
import { positionKey } from "./repertoire-generator.ts";
import { getExplorerCache, putExplorerCache } from "./storage";

const CLIENT_ID = "neverpay4chess-repertoire";
const AUTH_KEY = "repertoire-lichess-auth";
const PENDING_KEY = "repertoire-lichess-pkce";
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export function explorerToken(): string | null {
  try {
    const auth = JSON.parse(sessionStorage.getItem(AUTH_KEY) ?? "null");
    return auth?.expiresAt > Date.now() ? auth.token : null;
  } catch {
    return null;
  }
}
export function forgetExplorerToken() {
  sessionStorage.removeItem(AUTH_KEY);
}
export async function authorizeExplorer() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const redirectUri = `${window.location.origin}/app/repertoire`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ verifier, state, redirectUri, createdAt: Date.now() }),
  );
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: base64url(new Uint8Array(digest)),
    state,
  });
  window.location.assign(`https://lichess.org/oauth?${params}`);
}
let callbackPromise: Promise<boolean> | undefined;
export function finishExplorerAuthorization(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("state") || (!params.has("code") && !params.has("error")))
    return callbackPromise ?? Promise.resolve(false);
  return (callbackPromise ??= (async () => {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    sessionStorage.removeItem(PENDING_KEY);
    window.history.replaceState(window.history.state, "", "/app/repertoire");
    if (
      !pending ||
      pending.state !== params.get("state") ||
      Date.now() - pending.createdAt > 15 * 60_000
    ) {
      throw new Error("The Lichess connection expired. Please connect again.");
    }
    if (params.has("error"))
      throw new Error("Lichess authorization was cancelled. You can connect again when ready.");
    const response = await fetch("https://lichess.org/api/token", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.get("code")!,
        code_verifier: pending.verifier,
        redirect_uri: pending.redirectUri,
        client_id: CLIENT_ID,
      }),
    });
    if (!response.ok) throw new Error("Could not finish connecting to Lichess. Please try again.");
    const data = await response.json();
    if (typeof data.access_token !== "string" || !Number.isFinite(data.expires_in))
      throw new Error("Lichess returned an invalid authorization response.");
    sessionStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000 - 30_000,
      }),
    );
    return true;
  })());
}

function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
let queue: Promise<unknown> = Promise.resolve();
let nextRequest = 0;
export function lookupExplorer(fen: string, signal: AbortSignal): Promise<BookPosition> {
  const operation = queue
    .catch(() => {})
    .then(async () => {
      signal.throwIfAborted();
      const key = `lichess-v1:blitz,rapid,classical:${positionKey(fen)}`;
      const cached = await getExplorerCache(key);
      if (cached) return cached;
      const token = explorerToken();
      if (!token) throw new Error("Connect Lichess explorer to generate your repertoire.");
      const params = new URLSearchParams({
        variant: "standard",
        fen,
        speeds: "blitz,rapid,classical",
        moves: "12",
        topGames: "0",
        recentGames: "0",
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        await pause(Math.max(0, nextRequest - Date.now()), signal);
        nextRequest = Date.now() + 550;
        const response = await fetch(`https://explorer.lichess.org/lichess?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        });
        if (response.status === 401 || response.status === 403) {
          forgetExplorerToken();
          throw new Error("Your Lichess connection expired. Please connect again.");
        }
        if (response.status === 429) {
          const retrySeconds = Number(response.headers.get("Retry-After"));
          nextRequest =
            Date.now() + Math.max(60_000, Number.isFinite(retrySeconds) ? retrySeconds * 1000 : 0);
          if (attempt < 2) continue;
          throw new Error(
            "Lichess is limiting requests. Wait a minute, then retry; loaded positions are cached.",
          );
        }
        if (!response.ok)
          throw new Error(
            `Lichess opening data is unavailable (${response.status}). Please retry.`,
          );
        const data = (await response.json()) as BookPosition;
        if (
          !Array.isArray(data.moves) ||
          ![data.white, data.draws, data.black].every((n) => Number.isFinite(n) && n >= 0) ||
          !data.moves.every(
            (m) =>
              typeof m.uci === "string" &&
              typeof m.san === "string" &&
              [m.white, m.draws, m.black].every((n) => Number.isFinite(n) && n >= 0),
          )
        ) {
          throw new Error("Lichess returned incomplete opening data. Please retry.");
        }
        await putExplorerCache(key, data);
        return data;
      }
      throw new Error("Lichess could not be reached.");
    });
  queue = operation;
  return operation;
}
