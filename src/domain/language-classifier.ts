import { extname } from "node:path";

import type { PullRequestFile, SupportedLanguage, SupportedPullRequestFile } from "./types";

const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".sql": "sql",
  ".cs": "csharp"
};

export function detectSupportedLanguage(filePath: string): SupportedLanguage | undefined {
  return EXTENSION_TO_LANGUAGE[extname(filePath).toLowerCase()];
}

export function classifySupportedFiles(files: PullRequestFile[]): SupportedPullRequestFile[] {
  return files.flatMap((file) => {
    const language = detectSupportedLanguage(file.path);
    if (!language) {
      return [];
    }

    return [{ ...file, language }];
  });
}
