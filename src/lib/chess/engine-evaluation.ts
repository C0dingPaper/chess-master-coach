export type EngineEvaluation = {
  bestMove: string | null;
  cp: number | null;
  mate: number | null;
  depth: number;
};

export function evaluationToCentipawns(evaluation: EngineEvaluation) {
  if (evaluation.cp != null) return evaluation.cp;
  if (evaluation.mate == null) return null;
  const sign = evaluation.mate >= 0 ? 1 : -1;
  return sign * (100000 - Math.min(Math.abs(evaluation.mate), 99) * 100);
}
