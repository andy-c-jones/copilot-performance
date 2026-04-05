import { describe, expect, it } from "vitest";

import { classifySupportedFiles, detectSupportedLanguage } from "../src/domain/language-classifier";
import type { PullRequestFile } from "../src/domain/types";

describe("language classifier", () => {
  it("detects supported extensions", () => {
    expect(detectSupportedLanguage("a.js")).toBe("javascript");
    expect(detectSupportedLanguage("a.tsx")).toBe("typescript");
    expect(detectSupportedLanguage("q.sql")).toBe("sql");
    expect(detectSupportedLanguage("Repo.cs")).toBe("csharp");
  });

  it("classifies supported files and ignores unsupported files", () => {
    const files: PullRequestFile[] = [
      { path: "src/a.ts", status: "modified", additions: 1, deletions: 0 },
      { path: "src/b.cs", status: "modified", additions: 1, deletions: 0 },
      { path: "README.md", status: "modified", additions: 1, deletions: 0 }
    ];

    const result = classifySupportedFiles(files);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.language)).toEqual(["typescript", "csharp"]);
  });
});
