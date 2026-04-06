import { describe, expect, it } from "vitest";

import {
  getPerformanceCheckLabelsForLanguages,
  getPromptModulesForLanguages
} from "../src/application/prompt-modules";

describe("prompt modules", () => {
  it("returns unique language modules", () => {
    const modules = getPromptModulesForLanguages(["javascript", "javascript", "csharp"]);
    expect(modules).toHaveLength(2);
    expect(modules.map((module) => module.language)).toEqual(["javascript", "csharp"]);
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

  it("includes LINQ and .NET logging guidance for csharp", () => {
    const [csharpModule] = getPromptModulesForLanguages(["csharp"]);
    expect(csharpModule?.checkLabels.join(" ")).toContain("LINQ");
    expect(csharpModule?.checkLabels.join(" ")).toContain(".NET logging");
    expect(csharpModule?.checkLabels.join(" ")).toContain("Sync-over-async");
    expect(csharpModule?.focusAreas.join(" ")).toContain("repeated enumeration");
    expect(csharpModule?.focusAreas.join(" ")).toContain("LoggerMessage");
    expect(csharpModule?.focusAreas.join(" ")).toContain("thread");
    expect(csharpModule?.focusAreas.join(" ")).toContain("HttpClient");
  });

  it("includes async and event-loop guidance for javascript", () => {
    const [javascriptModule] = getPromptModulesForLanguages(["javascript"]);
    expect(javascriptModule?.checkLabels.join(" ")).toContain("event-loop");
    expect(javascriptModule?.focusAreas.join(" ")).toContain("Promise.all");
    expect(javascriptModule?.focusAreas.join(" ")).toContain("synchronous APIs");
  });

  it("includes runtime transform overhead guidance for typescript", () => {
    const [typescriptModule] = getPromptModulesForLanguages(["typescript"]);
    expect(typescriptModule?.checkLabels.join(" ")).toContain("validation");
    expect(typescriptModule?.checkLabels.join(" ")).toContain("multi-pass");
    expect(typescriptModule?.focusAreas.join(" ")).toContain("schema validation");
    expect(typescriptModule?.focusAreas.join(" ")).toContain("materialize arrays");
  });
});
