import { describe, expect, it } from "vitest";

import {
  filterFindings,
  isConfidenceAtLeast,
  isSeverityAtLeast
} from "../src/domain/finding-filter";
import type { PerformanceFinding } from "../src/domain/types";

const finding = (overrides: Partial<PerformanceFinding>): PerformanceFinding => ({
  path: "src/file.ts",
  title: "title",
  issue: "issue",
  whyItMatters: "why",
  recommendation: "fix",
  complexity: "O(n)",
  severity: "medium",
  confidence: "high",
  impactScore: 3,
  ...overrides
});

describe("finding filter", () => {
  it("compares severity and confidence ranks", () => {
    expect(isSeverityAtLeast("high", "medium")).toBe(true);
    expect(isSeverityAtLeast("low", "high")).toBe(false);
    expect(isConfidenceAtLeast("high", "high")).toBe(true);
    expect(isConfidenceAtLeast("medium", "high")).toBe(false);
  });

  it("filters findings by threshold policy", () => {
    const findings: PerformanceFinding[] = [
      finding({ title: "keep", severity: "high", confidence: "high", impactScore: 4 }),
      finding({ title: "drop-low-severity", severity: "low", confidence: "high", impactScore: 5 }),
      finding({
        title: "drop-low-confidence",
        severity: "high",
        confidence: "medium",
        impactScore: 5
      }),
      finding({ title: "drop-low-impact", severity: "high", confidence: "high", impactScore: 2 })
    ];

    const result = filterFindings(findings, {
      minSeverity: "medium",
      minConfidence: "high",
      minImpactScore: 3
    });

    expect(result.map((item) => item.title)).toEqual(["keep"]);
  });
});
