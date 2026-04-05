import type { SupportedLanguage, SymbolKind } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsTsPatterns(symbolName: string, symbolKind: SymbolKind): RegExp[] {
  const name = escapeRegExp(symbolName);
  const classPattern = new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?class\\s+${name}\\b`);
  const functionPatterns = [
    new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`),
    new RegExp(
      `^\\s*(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)`
    )
  ];
  const methodPattern = new RegExp(
    `^\\s*(?:public\\s+|private\\s+|protected\\s+|static\\s+|async\\s+|readonly\\s+|#)*${name}\\s*(?:<[^>]+>)?\\s*\\(`
  );

  switch (symbolKind) {
    case "class":
      return [classPattern];
    case "method":
      return [methodPattern];
    case "component":
    case "function":
      return [...functionPatterns, classPattern, methodPattern];
    default:
      return [...functionPatterns, classPattern, methodPattern];
  }
}

function csharpPatterns(symbolName: string, symbolKind: SymbolKind): RegExp[] {
  const name = escapeRegExp(symbolName);
  const classPattern = new RegExp(
    `^\\s*(?:public|private|protected|internal|sealed|abstract|partial|static|\\s)*class\\s+${name}\\b`
  );
  const methodPattern = new RegExp(
    `^\\s*(?:public|private|protected|internal|static|virtual|override|async|sealed|partial|new|extern|unsafe|\\s)+[\\w<>,\\[\\]\\?\\s]+\\s+${name}\\s*\\(`
  );

  switch (symbolKind) {
    case "class":
      return [classPattern];
    case "method":
    case "function":
      return [methodPattern];
    default:
      return [classPattern, methodPattern];
  }
}

function patternsFor(
  language: SupportedLanguage,
  symbolName: string,
  symbolKind: SymbolKind | undefined
): RegExp[] {
  const normalizedKind = symbolKind ?? "unknown";

  switch (language) {
    case "javascript":
    case "typescript":
      return jsTsPatterns(symbolName, normalizedKind);
    case "csharp":
      return csharpPatterns(symbolName, normalizedKind);
    default:
      return [];
  }
}

export function locateSymbolDefinitionLine(input: {
  content: string;
  language: SupportedLanguage;
  symbolName?: string;
  symbolKind?: SymbolKind;
}): number | undefined {
  if (!input.symbolName) {
    return undefined;
  }

  const patterns = patternsFor(input.language, input.symbolName, input.symbolKind);
  if (patterns.length === 0) {
    return undefined;
  }

  const lines = input.content.split("\n");
  for (const [lineIndex, line] of lines.entries()) {
    if (patterns.some((pattern) => pattern.test(line))) {
      return lineIndex + 1;
    }
  }

  return undefined;
}
