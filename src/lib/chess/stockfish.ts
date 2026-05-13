import stockfishScriptUrl from "stockfish/bin/stockfish-18-lite-single.js?url";
import stockfishWasmUrl from "stockfish/bin/stockfish-18-lite-single.wasm?url";

export type EngineEvaluation = {
  bestMove: string | null;
  cp: number | null;
  mate: number | null;
  depth: number;
};

type LineHandler = (line: string) => void;

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
  private initialized = false;

  constructor() {
    this.worker = new Worker(workerUrl());
    this.worker.addEventListener("message", (event) => {
      const line = String(event.data);
      for (const handler of this.handlers) handler(line);
    });
  }

  private send(command: string) {
    this.worker.postMessage(command);
  }

  private waitFor(matcher: (line: string) => boolean, timeoutMs = 12000) {
    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.handlers.delete(handler);
        reject(new Error("Stockfish timed out"));
      }, timeoutMs);

      const handler: LineHandler = (line) => {
        if (!matcher(line)) return;
        window.clearTimeout(timer);
        this.handlers.delete(handler);
        resolve(line);
      };

      this.handlers.add(handler);
    });
  }

  async init() {
    if (this.initialized) return;
    this.send("uci");
    await this.waitFor((line) => line === "uciok");
    this.send("setoption name Hash value 16");
    this.send("setoption name Skill Level value 20");
    this.send("isready");
    await this.waitFor((line) => line === "readyok");
    this.send("ucinewgame");
    this.initialized = true;
  }

  async evaluateFen(fen: string, movetimeMs = 180): Promise<EngineEvaluation> {
    await this.init();

    return new Promise((resolve, reject) => {
      let evaluation: EngineEvaluation = { bestMove: null, cp: null, mate: null, depth: 0 };
      const timer = window.setTimeout(
        () => {
          this.handlers.delete(handler);
          reject(new Error("Stockfish timed out"));
        },
        Math.max(12000, movetimeMs + 8000),
      );

      const handler: LineHandler = (line) => {
        if (line.startsWith("info ")) {
          evaluation = parseInfoLine(line, evaluation);
          return;
        }

        if (!line.startsWith("bestmove ")) return;
        const [, bestMove] = line.split(/\s+/);
        window.clearTimeout(timer);
        this.handlers.delete(handler);
        resolve({ ...evaluation, bestMove: bestMove && bestMove !== "(none)" ? bestMove : null });
      };

      this.handlers.add(handler);
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${movetimeMs}`);
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
  }
}

export function evaluationToCentipawns(evaluation: EngineEvaluation) {
  if (evaluation.cp != null) return evaluation.cp;
  if (evaluation.mate == null) return null;
  const sign = evaluation.mate >= 0 ? 1 : -1;
  return sign * (100000 - Math.min(Math.abs(evaluation.mate), 99) * 100);
}
