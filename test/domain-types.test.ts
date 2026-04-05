import { describe, expect, it } from "vitest";

import {
  CONFIDENCE_LEVELS,
  SEVERITY_LEVELS,
  SUPPORTED_LANGUAGES,
  SYMBOL_KINDS
} from "../src/domain/types";

describe("domain constants", () => {
  it("defines supported languages and enums", () => {
    expect(SUPPORTED_LANGUAGES).toContain("typescript");
    expect(SEVERITY_LEVELS).toContain("critical");
    expect(CONFIDENCE_LEVELS).toContain("high");
    expect(SYMBOL_KINDS).toContain("class");
  });
});
