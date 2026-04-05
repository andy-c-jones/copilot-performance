import type { FilterThresholds, PerformanceFinding, Severity, Confidence } from "./types";

const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  low: 1,
  medium: 2,
  high: 3
};

export function isSeverityAtLeast(severity: Severity, minSeverity: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minSeverity];
}

export function isConfidenceAtLeast(confidence: Confidence, minConfidence: Confidence): boolean {
  return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[minConfidence];
}

export function filterFindings(
  findings: PerformanceFinding[],
  thresholds: FilterThresholds
): PerformanceFinding[] {
  return findings.filter((finding) => {
    return (
      isSeverityAtLeast(finding.severity, thresholds.minSeverity) &&
      isConfidenceAtLeast(finding.confidence, thresholds.minConfidence) &&
      finding.impactScore >= thresholds.minImpactScore
    );
  });
}
