import { describe, expect, it } from "vitest";

import {
  getPerformanceCheckLabelsForLanguages,
  getPromptModulesForLanguages
} from "../src/application/prompt-modules";

describe("prompt modules", () => {
  it("returns unique language modules", () => {
    const modules = getPromptModulesForLanguages(["javascript", "javascript", "sql"]);
    expect(modules).toHaveLength(2);
    expect(modules.map((module) => module.language)).toEqual(["javascript", "sql"]);
  });

  it("returns de-duplicated check labels for active languages", () => {
    const labels = getPerformanceCheckLabelsForLanguages([
      "javascript",
      "typescript",
      "javascript"
    ]);

    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
