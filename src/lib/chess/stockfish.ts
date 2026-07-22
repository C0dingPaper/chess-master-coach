import type { EngineEvaluation } from "@/lib/chess/engine-evaluation";

export type { EngineEvaluation } from "@/lib/chess/engine-evaluation";
export { evaluationToCentipawns } from "@/lib/chess/engine-evaluation";

type LineHandler = (line: string) => void;
type ErrorHandler = (error: Error) => void;

const STOCKFISH_DEBUG = true;

function debugStockfish(...args: unknown[]) {
  if (!STOCKFISH_DEBUG) return;
  console.log("[stockfish]", ...args);
}

type EvaluateFenOptions = {
  movetimeMs?: number;
  depth?: number;
  timeoutMs?: number;
  hardTimeoutMs?: number;
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
  return `/stockfish/stockfish-18-lite-single.js#/stockfish/stockfish-18-lite-single.wasm`;
}

export class StockfishClient {
  private worker: Worker;
  private handlers = new Set<LineHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    debugStockfish("creating worker", workerUrl());

    this.worker = new Worker(workerUrl(), { name: "stockfish-review" });

    debugStockfish("worker created");

    this.worker.addEventListener("message", (event) => {
      const line = String(event.data);
      debugStockfish("<<", line);

      for (const handler of this.handlers) handler(line);
    });

    this.worker.addEventListener("error", (event) => {
      debugStockfish("worker error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });

      const error = new Error(event.message || "Stockfish worker failed");
      for (const handler of this.errorHandlers) handler(error);
    });

    this.worker.addEventListener("messageerror", (event) => {
      debugStockfish("worker messageerror", event);

      const error = new Error("Stockfish sent an unreadable message");
      for (const handler of this.errorHandlers) handler(error);
    });
  }

  private send(command: string) {
    debugStockfish(">>", command);
    this.worker.postMessage(command);
  }

  private waitFor(
    matcher: (line: string) => boolean,
    timeoutMs = 45000,
    timeoutMessage = "Stockfish timed out",
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
    debugStockfish("init called", {
      initialized: this.initialized,
      initializing: Boolean(this.initializing),
    });

    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this.initInternal();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initInternal() {
    const startedAt = performance.now();
    debugStockfish("init started");

    const uciReady = this.waitFor(
      (line) => line === "uciok",
      60000,
      "Stockfish timed out while loading",
    );

    this.send("uci");
    await uciReady;

    debugStockfish("uci ready after", Math.round(performance.now() - startedAt), "ms");

    this.send("setoption name Hash value 128");
    this.send("setoption name Skill Level value 20");
    this.send("setoption name Move Overhead value 10");
    this.send("setoption name MultiPV value 1");
    this.send("setoption name UCI_ShowWDL value true");

    const readyStartedAt = performance.now();

    const engineReady = this.waitFor(
      (line) => line === "readyok",
      30000,
      "Stockfish timed out while preparing",
    );

    this.send("isready");
    await engineReady;

    debugStockfish("readyok after", Math.round(performance.now() - readyStartedAt), "ms");

    this.send("ucinewgame");
    this.initialized = true;

    debugStockfish("init complete after", Math.round(performance.now() - startedAt), "ms");
  }

  async evaluateFen(fen: string, options: EvaluateFenOptions = {}): Promise<EngineEvaluation> {
    const queued = this.queue.then(
      () => this.evaluateFenNow(fen, options),
      () => this.evaluateFenNow(fen, options),
    );

    this.queue = queued.then(
      () => undefined,
      () => undefined,
    );

    return queued;
  }

  private async evaluateFenNow(
    fen: string,
    { movetimeMs = 220, depth, timeoutMs, hardTimeoutMs }: EvaluateFenOptions = {},
  ): Promise<EngineEvaluation> {
    await this.init();
    const startedAt = performance.now();
    debugStockfish("evaluate started", {
      fen,
      depth,
      movetimeMs,
      timeoutMs,
      hardTimeoutMs,
    });
    return new Promise((resolve, reject) => {
      let evaluation: EngineEvaluation = {
        bestMove: null,
        cp: null,
        mate: null,
        depth: 0,
      };

      let stopped = false;
      let resolved = false;

      const softLimit = timeoutMs ?? (depth ? 30000 : Math.max(1000, movetimeMs + 1000));

      const fallbackHardLimit = softLimit + Math.min(3000, Math.max(1200, softLimit));
      const hardLimit = Math.max(hardTimeoutMs ?? fallbackHardLimit, softLimit + 250);

      const cleanup = () => {
        window.clearTimeout(softTimer);
        window.clearTimeout(hardTimer);
        this.handlers.delete(handler);
        this.errorHandlers.delete(errorHandler);
      };

      const requestStop = () => {
        if (stopped || resolved) return;
        stopped = true;

        try {
          this.send("stop");
        } catch {
          // Worker may already be gone.
        }
      };

      const softTimer = window.setTimeout(() => {
        requestStop();
      }, softLimit);

      const hardTimer = window.setTimeout(() => {
        if (resolved) return;

        requestStop();
        resolved = true;
        cleanup();
        reject(new Error(`Stockfish did not return bestmove for ${fen}`));
      }, hardLimit);

      const handler: LineHandler = (line) => {
        if (line.startsWith("info ")) {
          evaluation = parseInfoLine(line, evaluation);
          return;
        }
        if (!line.startsWith("bestmove ")) return;
        const [, bestMove] = line.split(/\s+/);
        debugStockfish("bestmove after", Math.round(performance.now() - startedAt), "ms", {
          bestMove,
          depth: evaluation.depth,
          cp: evaluation.cp,
          mate: evaluation.mate,
        });

        resolved = true;
        cleanup();

        resolve({
          ...evaluation,
          bestMove: bestMove && bestMove !== "(none)" ? bestMove : null,
        });
      };

      const errorHandler: ErrorHandler = (error) => {
        if (resolved) return;

        resolved = true;
        cleanup();
        reject(error);
      };

      this.handlers.add(handler);
      this.errorHandlers.add(errorHandler);

      this.send(`position fen ${fen}`);

      if (depth && depth > 0) {
        this.send(`go depth ${depth}`);
      } else {
        this.send(`go movetime ${movetimeMs}`);
      }
    });
  }

  dispose() {
    try {
      this.send("quit");
    } catch {
      // Worker may already be gone.
    }

    this.worker.terminate();
    this.handlers.clear();
    this.errorHandlers.clear();
  }
}
