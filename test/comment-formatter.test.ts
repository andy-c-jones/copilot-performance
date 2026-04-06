import { describe, expect, it } from "vitest";

import {
  formatReviewSummaryComment,
  formatSkippedFilesComment
} from "../src/application/comment-formatter";

describe("comment formatter", () => {
  it("adds tool attribution to review summary comments", () => {
    const body = formatReviewSummaryComment("Custom review summary.");

    expect(body).toContain("<!-- copilot-performance-review -->");
    expect(body).toContain("### ⚡ PR Performance Reviewer");
    expect(body).toContain("**Commenting tool:** `andy-c-jones/copilot-performance`");
    expect(body).toContain("Custom review summary.");
  });

  it("does not duplicate attribution when marker already exists", () => {
    const existing = "<!-- copilot-performance-review -->\nExisting attributed body";

    expect(formatReviewSummaryComment(existing)).toBe(existing);
  });

  it("adds tool attribution to skipped-files comments", () => {
    const body = formatSkippedFilesComment({
      model: "openai/gpt-4.1",
      maxPatchCharacters: 6000,
      maxFileCharacters: 12000,
      skipDirectories: ["dist"],
      skippedFiles: [
        {
          path: "src/huge.ts",
          language: "typescript",
          reason: "patch_too_large",
          patchCharacters: 7000
        }
      ]
    });

    expect(body).toContain("<!-- copilot-performance-skipped-files -->");
    expect(body).toContain("### ⚡ PR Performance Reviewer");
    expect(body).toContain("**Commenting tool:** `andy-c-jones/copilot-performance`");
    expect(body).toContain("src/huge.ts");
  });
});
