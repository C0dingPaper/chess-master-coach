import stockfishScriptUrl from "stockfish/bin/stockfish-18-lite-single.js?url";
import stockfishWasmUrl from "stockfish/bin/stockfish-18-lite-single.wasm?url";
import type { EngineEvaluation } from "@/lib/chess/engine-evaluation";
export type { EngineEvaluation } from "@/lib/chess/engine-evaluation";
export { evaluationToCentipawns } from "@/lib/chess/engine-evaluation";

type LineHandler = (line: string) => void;
type ErrorHandler = (error: Error) => void;

type EvaluateFenOptions = {
  movetimeMs?: number;
  depth?: number;
  timeoutMs?: number;
};

function parseInfoLine(line: string, current: EngineEvaluation): EngineEvaluation {
  const depthMatch = line.match(/\bdepth\s+(-?\d+)/);
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);

  return {
    ...current,
    depth: depthMatch ? Number(depthMatch[1]) : current.depth,
    cp: cpMatch ? Number(cpMatch[1]) : mateMatch ? null : current.cp,
    mate: mateMatch ? Number(mateMatch[1]) : cpMatch ? null : current.mate,
  };
}

function workerUrl() {
  return `${stockfishScriptUrl}#${encodeURIComponent(stockfishWasmUrl)},worker`;
}

export class StockfishClient {
  private worker: Worker;
  private handlers = new Set<LineHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  private initialized = false;

  constructor() {
    this.worker = new Worker(workerUrl(), { name: "stockfish-review" });
    this.worker.addEventListener("message", (event) => {
      const line = String(event.data);
      for (const handler of this.handlers) handler(line);
    });
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Stockfish worker failed");
      for (const handler of this.errorHandlers) handler(error);
    });
    this.worker.addEventListener("messageerror", () => {
      const error = new Error("Stockfish sent an unreadable message");
      for (const handler of this.errorHandlers) handler(error);
    });
  }

  private send(command: string) {
    this.worker.postMessage(command);
  }

  private waitFor(
    matcher: (line: string) => boolean,
    timeoutMs = 45000,
    timeoutMessage = "Stockfish timed out while starting",
  ) {
    return new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        this.handlers.delete(handler);
        this.errorHandlers.delete(errorHandler);
      };
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      const handler: LineHandler = (line) => {
        if (!matcher(line)) return;
        cleanup();
        resolve(line);
      };

      const errorHandler: ErrorHandler = (error) => {
        cleanup();
        reject(error);
      };

      this.handlers.add(handler);
      this.errorHandlers.add(errorHandler);
    });
  }

  async init() {
    if (this.initialized) return;
    const uciReady = this.waitFor(
      (line) => line === "uciok",
      60000,
      "Stockfish timed out while loading",
    );
    this.send("uci");
    await uciReady;
    this.send("setoption name Hash value 32");
    this.send("setoption name Skill Level value 20");
    this.send("setoption name Move Overhead value 10");
    const engineReady = this.waitFor(
      (line) => line === "readyok",
      45000,
      "Stockfish timed out while preparing",
    );
    this.send("isready");
    await engineReady;
    this.send("ucinewgame");
    this.initialized = true;
  }

  async evaluateFen(
    fen: string,
    { movetimeMs = 140, depth, timeoutMs }: EvaluateFenOptions = {},
  ): Promise<EngineEvaluation> {
    await this.init();

    return new Promise((resolve, reject) => {
      let evaluation: EngineEvaluation = { bestMove: null, cp: null, mate: null, depth: 0 };
      const limit = timeoutMs ?? (depth ? 30000 : Math.max(25000, movetimeMs + 16000));
      const cleanup = () => {
        window.clearTimeout(timer);
        this.handlers.delete(handler);
        this.errorHandlers.delete(errorHandler);
      };
      const timer = window.setTimeout(() => {
        cleanup();
        try {
          this.send("stop");
        } catch {
          // The worker may already be gone.
        }
        reject(new Error(`Stockfish timed out evaluating ${fen}`));
      }, limit);

      const handler: LineHandler = (line) => {
        if (line.startsWith("info ")) {
          evaluation = parseInfoLine(line, evaluation);
          return;
        }

        if (!line.startsWith("bestmove ")) return;
        const [, bestMove] = line.split(/\s+/);
        cleanup();
        resolve({ ...evaluation, bestMove: bestMove && bestMove !== "(none)" ? bestMove : null });
      };

      const errorHandler: ErrorHandler = (error) => {
        cleanup();
        reject(error);
      };

      this.handlers.add(handler);
      this.errorHandlers.add(errorHandler);
      this.send(`position fen ${fen}`);
      this.send(depth ? `go depth ${depth}` : `go movetime ${movetimeMs}`);
    });
  }

  dispose() {
    try {
      this.send("quit");
    } catch {
      // The worker may already be gone.
    }
    this.worker.terminate();
    this.handlers.clear();
    this.errorHandlers.clear();
  }
}
