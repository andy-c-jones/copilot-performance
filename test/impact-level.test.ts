import { describe, expect, it } from "vitest";

import { minImpactScoreForLevel, parseImpactLevel } from "../src/domain/impact-level";

describe("impact level", () => {
  it("parses allowed levels", () => {
    expect(parseImpactLevel("all")).toBe("all");
    expect(parseImpactLevel("low")).toBe("low");
    expect(parseImpactLevel("medium")).toBe("medium");
    expect(parseImpactLevel("high")).toBe("high");
  });

  it("maps impact levels to minimum impact scores", () => {
    expect(minImpactScoreForLevel("all")).toBe(1);
    expect(minImpactScoreForLevel("low")).toBe(2);
    expect(minImpactScoreForLevel("medium")).toBe(3);
    expect(minImpactScoreForLevel("high")).toBe(4);
  });

  it("throws for unsupported values", () => {
    expect(() => parseImpactLevel("critical")).toThrow("Invalid impact-level value: critical");
  });
});
