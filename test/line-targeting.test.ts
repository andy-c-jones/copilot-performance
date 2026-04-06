import { describe, expect, it } from "vitest";

import { resolveFindingLine } from "../src/application/line-targeting";
import type { PerformanceFinding } from "../src/domain/types";

const baseFinding: PerformanceFinding = {
  path: "src/example.ts",
  title: "issue",
  issue: "issue",
  whyItMatters: "why",
  recommendation: "fix",
  complexity: "O(n^2)",
  severity: "high",
  confidence: "high",
  impactScore: 4
};

describe("line targeting", () => {
  it("prefers symbol definition line when available", () => {
    const content = [
      "export function expensive(items: number[]) {",
      "  for (const item of items) {",
      "    console.log(item);",
      "  }",
      "}"
    ].join("\n");

    const patch = ["@@ -1,0 +1,5 @@", "+export function expensive(items: number[]) {", "+}"].join(
      "\n"
    );

    const line = resolveFindingLine({
      finding: { ...baseFinding, symbolName: "expensive", symbolKind: "function" },
      language: "typescript",
      content,
      patch
    });

    expect(line).toBe(1);
  });

  it("anchors function findings to signature line when signature is in patch context", () => {
    const content = [
      "export async function upsertSkippedFilesComment(input: Input): Promise<void> {",
      "  const existing = await listComments();",
      "  return existing;",
      "}"
    ].join("\n");

    const patch = [
      "@@ -1,3 +1,4 @@",
      " export async function upsertSkippedFilesComment(input: Input): Promise<void> {",
      "+  const reviewed = true;",
      "   const existing = await listComments();",
      "   return existing;",
      " }"
    ].join("\n");

    const line = resolveFindingLine({
      finding: {
        ...baseFinding,
        symbolName: "upsertSkippedFilesComment",
        symbolKind: "function"
      },
      language: "typescript",
      content,
      patch
    });

    expect(line).toBe(1);
  });

  it("falls back to nearest changed line when preferred line is outside patch", () => {
    const content = ["function expensive() {}", "function caller() {}", "caller();"].join("\n");
    const patch = ["@@ -3,0 +3,1 @@", "+caller();"].join("\n");

    const line = resolveFindingLine({
      finding: { ...baseFinding, line: 1 },
      language: "javascript",
      content,
      patch
    });

    expect(line).toBe(3);
  });

  it("keeps model-provided line when it is present in patch context", () => {
    const content = ["const marker = true;", "function expensive() {}", "caller();"].join("\n");
    const patch = [
      "@@ -1,3 +1,4 @@",
      " const marker = true;",
      "+const added = true;",
      " caller();"
    ].join("\n");

    const line = resolveFindingLine({
      finding: { ...baseFinding, line: 1, symbolName: undefined, symbolKind: undefined },
      language: "javascript",
      content,
      patch
    });

    expect(line).toBe(1);
  });

  it("falls back to first changed line when no preferred line exists", () => {
    const patch = ["@@ -10,0 +10,2 @@", "+a", "+b"].join("\n");

    const line = resolveFindingLine({
      finding: { ...baseFinding, line: undefined, symbolName: undefined, symbolKind: undefined },
      language: "javascript",
      content: "const a = 1;",
      patch
    });

    expect(line).toBe(10);
  });

  it("returns undefined when no preferred line and no changed lines", () => {
    const line = resolveFindingLine({
      finding: { ...baseFinding, line: undefined, symbolName: undefined, symbolKind: undefined },
      language: "javascript",
      content: "const a = 1;",
      patch: undefined
    });

    expect(line).toBeUndefined();
  });
});
