import type { PerformanceFinding } from "../domain/types";

const REVIEW_COMMENT_MARKER = "<!-- copilot-performance-review -->";
const SKIPPED_COMMENT_MARKER = "<!-- copilot-performance-skipped-files -->";
const TOOL_COMMENT_HEADER = "### ⚡ PR Performance Reviewer";
const TOOL_COMMENT_ATTRIBUTION_LINE =
  "**Commenting tool:** `andy-c-jones/copilot-performance` (Copilot performance review action)";

type SkippedCommentReason = "generated_artifact" | "patch_too_large" | "file_too_large" | string;

interface SkippedCommentFile {
  path: string;
  language: string;
  reason: SkippedCommentReason;
  patchCharacters?: number;
  fileCharacters?: number;
}

interface SkippedFilesCommentInput {
  model: string;
  maxPatchCharacters: number;
  maxFileCharacters: number;
  skipDirectories: string[];
  skippedFiles: SkippedCommentFile[];
}

function formatAttributedToolComment(input: { marker: string; content: string }): string {
  if (input.content.includes(input.marker)) {
    return input.content;
  }

  return [
    input.marker,
    TOOL_COMMENT_HEADER,
    "",
    TOOL_COMMENT_ATTRIBUTION_LINE,
    "",
    input.content
  ].join("\n");
}

function describeSkippedFileReason(skippedFile: {
  reason: SkippedCommentReason;
  patchCharacters?: number;
  fileCharacters?: number;
}): string {
  switch (skippedFile.reason) {
    case "generated_artifact":
      return "generated/bundled artifact path";
    case "patch_too_large":
      return `patch exceeds limit (${skippedFile.patchCharacters ?? 0} chars)`;
    case "file_too_large":
      return `file content exceeds limit (${skippedFile.fileCharacters ?? 0} chars)`;
    default:
      return "unknown skip reason";
  }
}

export function formatInlineComment(finding: PerformanceFinding): string {
  return [
    `**Performance issue:** ${finding.title}`,
    `**Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Impact score:** ${finding.impactScore}/5`,
    "",
    `**What is wrong**\n${finding.issue}`,
    "",
    `**Why this matters**\n${finding.whyItMatters}`,
    "",
    `**Complexity and scale impact**\n${finding.complexity}`,
    "",
    `**Suggested improvement**\n${finding.recommendation}`
  ].join("\n");
}

export function formatReviewSummaryComment(reviewSummary: string): string {
  return formatAttributedToolComment({
    marker: REVIEW_COMMENT_MARKER,
    content: reviewSummary
  });
}

export function getSkippedFilesCommentMarker(): string {
  return SKIPPED_COMMENT_MARKER;
}

export function formatSkippedFilesComment(input: SkippedFilesCommentInput): string {
  const skippedRows = input.skippedFiles
    .map((file) => {
      return `- \`${file.path}\` (${file.language}): ${describeSkippedFileReason(file)}`;
    })
    .join("\n");

  return formatAttributedToolComment({
    marker: SKIPPED_COMMENT_MARKER,
    content: [
      "⚠️ Some files were skipped during performance review",
      "",
      `Configured model: \`${input.model}\``,
      `Skip limits: patch <= ${input.maxPatchCharacters} chars, file <= ${input.maxFileCharacters} chars`,
      `Skip directories: ${input.skipDirectories.join(", ") || "none"}`,
      "",
      skippedRows
    ].join("\n")
  });
}
