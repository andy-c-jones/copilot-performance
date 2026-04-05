import { describe, expect, it } from "vitest";

import {
  CONFIDENCE_LEVELS,
  IMPACT_LEVELS,
  SEVERITY_LEVELS,
  SUPPORTED_LANGUAGES,
  SYMBOL_KINDS
} from "../src/domain/types";

describe("domain constants", () => {
  it("defines supported languages and enums", () => {
    expect(SUPPORTED_LANGUAGES).toContain("typescript");
    expect(SEVERITY_LEVELS).toContain("critical");
    expect(CONFIDENCE_LEVELS).toContain("high");
    expect(IMPACT_LEVELS).toContain("all");
    expect(SYMBOL_KINDS).toContain("class");
  });
});
