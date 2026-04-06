import {
  extractAddedLinesFromPatch,
  extractRightSideLinesFromPatch,
  findNearestChangedLine
} from "../domain/diff-lines";
import { locateSymbolDefinitionLine } from "../domain/symbol-locator";
import type { PerformanceFinding, SupportedLanguage } from "../domain/types";

export interface ResolveFindingLineInput {
  finding: PerformanceFinding;
  language: SupportedLanguage;
  content: string;
  patch?: string;
}

export function resolveFindingLine(input: ResolveFindingLineInput): number | undefined {
  const changedLines = extractAddedLinesFromPatch(input.patch);
  const rightSideLines = extractRightSideLinesFromPatch(input.patch);
  const symbolLine = locateSymbolDefinitionLine({
    content: input.content,
    language: input.language,
    symbolName: input.finding.symbolName,
    symbolKind: input.finding.symbolKind
  });
  if (symbolLine && (rightSideLines.size === 0 || rightSideLines.has(symbolLine))) {
    return symbolLine;
  }

  const preferredLine = input.finding.line;
  if (!preferredLine) {
    return changedLines.size > 0 ? Math.min(...changedLines) : undefined;
  }

  if (rightSideLines.size === 0 || rightSideLines.has(preferredLine)) {
    return preferredLine;
  }

  return findNearestChangedLine(changedLines, preferredLine);
}
