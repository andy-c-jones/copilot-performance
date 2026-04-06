export const SUPPORTED_LANGUAGES = ["javascript", "typescript", "csharp"] as const;
export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const IMPACT_LEVELS = ["all", "low", "medium", "high"] as const;
export const SYMBOL_KINDS = [
  "function",
  "method",
  "class",
  "query",
  "component",
  "unknown"
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type Severity = (typeof SEVERITY_LEVELS)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

export interface PullRequestFile {
  path: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
}

export interface SupportedPullRequestFile extends PullRequestFile {
  language: SupportedLanguage;
}

export interface PerformanceFinding {
  path: string;
  title: string;
  issue: string;
  whyItMatters: string;
  recommendation: string;
  complexity: string;
  severity: Severity;
  confidence: Confidence;
  impactScore: number;
  line?: number;
  symbolName?: string;
  symbolKind?: SymbolKind;
}

export interface InlineReviewComment {
  path: string;
  line: number;
  body: string;
}

export interface FilterThresholds {
  minSeverity: Severity;
  minConfidence: Confidence;
  minImpactScore: number;
}
