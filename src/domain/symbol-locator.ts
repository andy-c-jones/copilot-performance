import type { SupportedLanguage, SymbolKind } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSymbolName(symbolName: string): string {
  const trimmed = symbolName.trim();
  if (!trimmed) {
    return "";
  }

  const withoutCallSuffix = trimmed.replace(/\(.*\)\s*$/, "");
  const withoutGenerics = withoutCallSuffix.replace(/<[^>]+>\s*$/, "");
  const segments = withoutGenerics.split(/::|[.#]/);
  return (segments[segments.length - 1] ?? "").trim();
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

  const normalizedSymbolName = normalizeSymbolName(input.symbolName);
  if (!normalizedSymbolName) {
    return undefined;
  }

  const patterns = patternsFor(input.language, normalizedSymbolName, input.symbolKind);

  const lines = input.content.split("\n");
  for (const [lineIndex, line] of lines.entries()) {
    if (patterns.some((pattern) => pattern.test(line))) {
      return lineIndex + 1;
    }
  }

  return undefined;
}
