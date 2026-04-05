import { extractAddedLinesFromPatch, findNearestChangedLine } from "../domain/diff-lines";
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
  const symbolLine = locateSymbolDefinitionLine({
    content: input.content,
    language: input.language,
    symbolName: input.finding.symbolName,
    symbolKind: input.finding.symbolKind
  });

  const preferredLine = symbolLine ?? input.finding.line;
  if (!preferredLine) {
    return changedLines.size > 0 ? Math.min(...changedLines) : undefined;
  }

  if (changedLines.size === 0) {
    return preferredLine;
  }

  if (changedLines.has(preferredLine)) {
    return preferredLine;
  }

  return findNearestChangedLine(changedLines, preferredLine);
}
