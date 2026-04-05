import { describe, expect, it } from "vitest";

import { buildCopilotPrompts } from "../src/application/prompt-builder";

describe("prompt builder", () => {
  it("builds prompts with language-specific focus", () => {
    const prompts = buildCopilotPrompts({
      owner: "o",
      repo: "r",
      pullNumber: 7,
      path: "src/app.tsx",
      language: "typescript",
      patch: "@@ -1,0 +1,1 @@\n+const x = 1;",
      content: "const x = 1;",
      activeLanguages: ["typescript", "csharp"],
      maxFindingsPerFile: 3
    });

    expect(prompts.systemPrompt).toContain("typescript");
    expect(prompts.systemPrompt).toContain("csharp");
    expect(prompts.userPrompt).toContain("src/app.tsx");
  });

  it("truncates large patch and content", () => {
    const large = "x".repeat(30_000);
    const prompts = buildCopilotPrompts({
      owner: "o",
      repo: "r",
      pullNumber: 7,
      path: "src/app.ts",
      language: "typescript",
      patch: large,
      content: large,
      activeLanguages: ["typescript"],
      maxFindingsPerFile: 2
    });

    expect(prompts.userPrompt).toContain("...truncated...");
  });

  it("handles empty patch and content safely", () => {
    const prompts = buildCopilotPrompts({
      owner: "o",
      repo: "r",
      pullNumber: 7,
      path: "src/app.ts",
      language: "typescript",
      patch: undefined,
      content: "",
      activeLanguages: ["typescript"],
      maxFindingsPerFile: 2
    });

    expect(prompts.userPrompt).toContain("Patch:");
    expect(prompts.userPrompt).toContain("File content snapshot:");
  });
});
