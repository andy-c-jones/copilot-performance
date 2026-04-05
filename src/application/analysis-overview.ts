import * as core from "@actions/core";

import { getPerformanceCheckLabelsForLanguages } from "./prompt-modules";
import type { ReviewPullRequestResult } from "./performance-review-service";
import type { Confidence, Severity } from "../domain/types";

export interface AnalysisOverviewContext {
  model: string;
  minSeverity: Severity;
  minConfidence: Confidence;
  minImpactScore: number;
  maxPatchCharacters: number;
  maxFileCharacters: number;
  skipGeneratedArtifacts: boolean;
  skipDirectoriesForJavaScriptAndTypeScript: string[];
  result: ReviewPullRequestResult;
}

export function buildAnalysisOverviewOutput(
  input: AnalysisOverviewContext
): Record<string, unknown> {
  return {
    model: input.model,
    thresholds: {
      minSeverity: input.minSeverity,
      minConfidence: input.minConfidence,
      minImpactScore: input.minImpactScore
    },
    limits: {
      maxPatchCharacters: input.maxPatchCharacters,
      maxFileCharacters: input.maxFileCharacters,
      skipGeneratedArtifacts: input.skipGeneratedArtifacts,
      skipDirectoriesForJavaScriptAndTypeScript: input.skipDirectoriesForJavaScriptAndTypeScript
    },
    activeLanguages: input.result.activeLanguages,
    supportedFilesDetected: input.result.supportedFilesDetected,
    analyzedFiles: input.result.analyzedFiles,
    totalRawFindings: input.result.totalRawFindings,
    totalHighValueFindings: input.result.totalHighValueFindings,
    commentsPosted: input.result.commentsPosted,
    skippedFiles: input.result.skippedFiles,
    skippedReason: input.result.skippedReason ?? null,
    analysisTrace: input.result.analysisTrace
  };
}

export function logAnalysisOverview(input: AnalysisOverviewContext): void {
  const checks = getPerformanceCheckLabelsForLanguages(input.result.activeLanguages);
  const languages = input.result.activeLanguages.join(", ") || "none";

  core.startGroup("Performance analysis overview");
  core.info(`Model: ${input.model}`);
  core.info(
    `Thresholds: severity>=${input.minSeverity}, confidence>=${input.minConfidence}, impact>=${input.minImpactScore}`
  );
  core.info(
    `Skip limits: patch<=${input.maxPatchCharacters} chars, file<=${input.maxFileCharacters} chars`
  );
  core.info(`Skip generated artifacts: ${input.skipGeneratedArtifacts ? "enabled" : "disabled"}`);
  core.info(
    `JS/TS skip directories: ${input.skipDirectoriesForJavaScriptAndTypeScript.join(", ") || "none"}`
  );
  core.info(`Languages analyzed: ${languages}`);
  if (checks.length > 0) {
    core.info(`Checks applied: ${checks.join("; ")}`);
  }
  core.info(`Supported files detected: ${input.result.supportedFilesDetected}`);
  core.info(`Files analyzed: ${input.result.analyzedFiles}`);
  core.info(`Raw findings generated: ${input.result.totalRawFindings}`);
  core.info(`High-value findings after filtering: ${input.result.totalHighValueFindings}`);
  core.info(`Comments posted: ${input.result.commentsPosted}`);
  core.info(`Files skipped before model call: ${input.result.skippedFiles.length}`);

  for (const fileSummary of input.result.analysisTrace) {
    if (fileSummary.skippedReason) {
      core.info(
        `- ${fileSummary.path} (${fileSummary.language}): skipped=${fileSummary.skippedReason}`
      );
      continue;
    }
    core.info(
      `- ${fileSummary.path} (${fileSummary.language}): raw=${fileSummary.rawFindings}, high-value=${fileSummary.highValueFindings}, comments-ready=${fileSummary.commentsPrepared}`
    );
  }
  core.endGroup();
}
