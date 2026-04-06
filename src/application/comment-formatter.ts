import type { PerformanceFinding } from "../domain/types";

const REVIEW_COMMENT_MARKER = "<!-- copilot-performance-review -->";
const REVIEW_COMMENT_HEADER = "### ⚡ PR Performance Reviewer";
const REVIEW_COMMENT_TOOL_LINE =
  "**Commenting tool:** `andy-c-jones/copilot-performance` (Copilot performance review action)";

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
  if (reviewSummary.includes(REVIEW_COMMENT_MARKER)) {
    return reviewSummary;
  }

  return [
    REVIEW_COMMENT_MARKER,
    REVIEW_COMMENT_HEADER,
    "",
    REVIEW_COMMENT_TOOL_LINE,
    "",
    reviewSummary
  ].join("\n");
}
