import type { PerformanceFinding } from "../domain/types";

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
