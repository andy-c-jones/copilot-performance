import { IMPACT_LEVELS, type ImpactLevel } from "./types";

const MIN_IMPACT_SCORE_BY_LEVEL: Record<ImpactLevel, number> = {
  all: 1,
  low: 2,
  medium: 3,
  high: 4
};

export function parseImpactLevel(value: string): ImpactLevel {
  if ((IMPACT_LEVELS as readonly string[]).includes(value)) {
    return value as ImpactLevel;
  }
  throw new Error(`Invalid impact-level value: ${value}`);
}

export function minImpactScoreForLevel(level: ImpactLevel): number {
  return MIN_IMPACT_SCORE_BY_LEVEL[level];
}
