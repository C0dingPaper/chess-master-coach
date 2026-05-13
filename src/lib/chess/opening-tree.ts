import { Chess } from "chess.js";
import type { StoredGame } from "./types";

export interface TreeNode {
  san: string; // "" for root
  fen: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  // children keyed by SAN of next move
  children: Map<string, TreeNode>;
}

export function buildOpeningTree(
  games: StoredGame[],
  color: "white" | "black",
  maxPly = 12,
): TreeNode {
  const root: TreeNode = {
    san: "",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    count: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    children: new Map(),
  };

  for (const g of games) {
    if (g.myColor !== color) continue;
    let chess: Chess;
    try {
      chess = new Chess();
      chess.loadPgn(g.pgn, { strict: false });
    } catch {
      continue;
    }
    const history = chess.history();
    if (history.length === 0) continue;

    let node = root;
    incr(node, g.result);
    const c = new Chess();
    const limit = Math.min(maxPly, history.length);
    for (let i = 0; i < limit; i++) {
      const san = history[i];
      try {
        c.move(san);
      } catch {
        break;
      }
      let child = node.children.get(san);
      if (!child) {
        child = { san, fen: c.fen(), count: 0, wins: 0, draws: 0, losses: 0, children: new Map() };
        node.children.set(san, child);
      }
      incr(child, g.result);
      node = child;
    }
  }
  return root;
}

function incr(n: TreeNode, r: "win" | "loss" | "draw") {
  n.count++;
  if (r === "win") n.wins++;
  else if (r === "loss") n.losses++;
  else n.draws++;
}

export interface SerializedNode {
  san: string;
  fen: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  children: SerializedNode[];
}

export function serializeTree(node: TreeNode): SerializedNode {
  return {
    san: node.san,
    fen: node.fen,
    count: node.count,
    wins: node.wins,
    draws: node.draws,
    losses: node.losses,
    children: Array.from(node.children.values())
      .sort((a, b) => b.count - a.count)
      .map(serializeTree),
  };
}
