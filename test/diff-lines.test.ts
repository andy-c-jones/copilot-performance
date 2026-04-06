import { describe, expect, it } from "vitest";

import {
  extractAddedLinesFromPatch,
  extractRightSideLinesFromPatch,
  findNearestChangedLine
} from "../src/domain/diff-lines";

describe("diff line helpers", () => {
  it("returns empty set when patch is missing", () => {
    expect(extractAddedLinesFromPatch(undefined).size).toBe(0);
  });

  it("extracts added lines from standard patch format", () => {
    const patch = ["@@ -10,3 +10,4 @@", " context", "+added-one", "-removed", "+added-two"].join(
      "\n"
    );

    const lines = [...extractAddedLinesFromPatch(patch)].sort((a, b) => a - b);
    expect(lines).toEqual([11, 12]);
  });

  it("extracts right-side lines from added and context patch lines", () => {
    const patch = [
      "@@ -20,3 +20,4 @@",
      " export function runTask() {",
      "+  const enabled = true;",
      "   return enabled;",
      " }"
    ].join("\n");

    const lines = [...extractRightSideLinesFromPatch(patch)].sort((a, b) => a - b);
    expect(lines).toEqual([20, 21, 22, 23]);
  });

  it("handles malformed hunks and nearest line lookup", () => {
    const patch = ["@@ malformed", "+a", "+b"].join("\n");
    expect(extractAddedLinesFromPatch(patch).size).toBe(0);
    expect(findNearestChangedLine(new Set<number>(), 10)).toBeUndefined();
    expect(findNearestChangedLine(new Set<number>([5, 20, 14]), 15)).toBe(14);
  });
});
