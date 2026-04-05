import { describe, expect, it } from "vitest";

import { getPromptModulesForLanguages } from "../src/application/prompt-modules";

describe("prompt modules", () => {
  it("returns unique language modules", () => {
    const modules = getPromptModulesForLanguages(["javascript", "javascript", "sql"]);
    expect(modules).toHaveLength(2);
    expect(modules.map((module) => module.language)).toEqual(["javascript", "sql"]);
  });
});
