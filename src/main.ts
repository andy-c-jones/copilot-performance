import * as core from "@actions/core";
import * as github from "@actions/github";

import {
  buildAnalysisOverviewOutput,
  logAnalysisOverview,
  type AnalysisOverviewContext
} from "./application/analysis-overview";
import { PerformanceReviewService } from "./application/performance-review-service";
import { upsertSkippedFilesComment } from "./application/skipped-files-comment";
import { minImpactScoreForLevel, parseImpactLevel } from "./domain/impact-level";
import {
  CONFIDENCE_LEVELS,
  SEVERITY_LEVELS,
  type Confidence,
  type ImpactLevel,
  type Severity
} from "./domain/types";
import {
  CopilotModelAccessError,
  CopilotServiceUnavailableError,
  CopilotModelsClient
} from "./infrastructure/copilot-models-client";
import { GitHubPullRequestClient } from "./infrastructure/github-pull-request-client";

const DEFAULT_MODEL = "openai/gpt-4.1";
const DEFAULT_COPILOT_API_URL = "https://models.github.ai/inference/chat/completions";

interface ParsedActionInputs {
  githubToken: string;
  model: string;
  copilotApiUrl: string;
  minSeverity: Severity;
  minConfidence: Confidence;
  impactLevel: ImpactLevel;
  minImpactScore: number;
  maxFindingsPerFile: number;
  maxPatchCharacters: number;
  maxFileCharacters: number;
  skipGeneratedArtifacts: boolean;
  skipDirectories: string[];
  reviewSummary: string;
}

function parseSeverity(value: string): Severity {
  if ((SEVERITY_LEVELS as readonly string[]).includes(value)) {
    return value as Severity;
  }
  throw new Error(`Invalid min-severity value: ${value}`);
}

function parseConfidence(value: string): Confidence {
  if ((CONFIDENCE_LEVELS as readonly string[]).includes(value)) {
    return value as Confidence;
  }
  throw new Error(`Invalid min-confidence value: ${value}`);
}

function parsePositiveInteger(input: string, fieldName: string): number {
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function parseBooleanInput(input: string, fieldName: string): boolean {
  const normalized = input.toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`${fieldName} must be 'true' or 'false'.`);
}

function parseCsvInput(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseInputs(): ParsedActionInputs {
  const impactLevel = parseImpactLevel(core.getInput("impact-level") || "medium");
  return {
    githubToken: core.getInput("github-token", { required: true }),
    model: core.getInput("model") || DEFAULT_MODEL,
    copilotApiUrl: core.getInput("copilot-api-url") || DEFAULT_COPILOT_API_URL,
    minSeverity: parseSeverity(core.getInput("min-severity") || "medium"),
    minConfidence: parseConfidence(core.getInput("min-confidence") || "high"),
    impactLevel,
    minImpactScore: minImpactScoreForLevel(impactLevel),
    maxFindingsPerFile: parsePositiveInteger(
      core.getInput("max-findings-per-file") || "3",
      "max-findings-per-file"
    ),
    maxPatchCharacters: parsePositiveInteger(
      core.getInput("max-patch-characters") || "6000",
      "max-patch-characters"
    ),
    maxFileCharacters: parsePositiveInteger(
      core.getInput("max-file-characters") || "12000",
      "max-file-characters"
    ),
    skipGeneratedArtifacts: parseBooleanInput(
      core.getInput("skip-generated-artifacts") || "true",
      "skip-generated-artifacts"
    ),
    skipDirectories: parseCsvInput(core.getInput("skip") || ""),
    reviewSummary:
      core.getInput("review-summary") ||
      "Performance review suggestions from Copilot. Address only if the impact aligns with your workload profile."
  };
}

function setModelAccessDeniedOutputs(input: ParsedActionInputs): void {
  core.warning(
    `Skipping Copilot analysis because model access was denied for '${input.model}'. Ensure the workflow has 'models: read' permission or configure a model your token can access.`
  );
  core.setOutput("supported-files-detected", "0");
  core.setOutput("analyzed-files", "0");
  core.setOutput("comments-posted", "0");
  core.setOutput("skipped-reason", "model_access_denied");
  core.setOutput(
    "analysis-overview",
    JSON.stringify({
      model: input.model,
      skippedReason: "model_access_denied",
      message: "Model access denied for the configured token.",
      impactLevel: input.impactLevel,
      maxPatchCharacters: input.maxPatchCharacters,
      maxFileCharacters: input.maxFileCharacters,
      skipDirectories: input.skipDirectories
    })
  );
}

function setCopilotUnavailableOutputs(
  input: ParsedActionInputs,
  error: CopilotServiceUnavailableError
): void {
  const statusText = error.status === 0 ? "network_error" : error.status.toString();
  const codeText = error.errorCode ? ` (${error.errorCode})` : "";
  core.warning(
    `Skipping Copilot analysis because the model service is unavailable for '${input.model}' [status ${statusText}${codeText}].`
  );
  core.setOutput("supported-files-detected", "0");
  core.setOutput("analyzed-files", "0");
  core.setOutput("comments-posted", "0");
  core.setOutput("skipped-reason", "copilot_unavailable");
  core.setOutput(
    "analysis-overview",
    JSON.stringify({
      model: input.model,
      skippedReason: "copilot_unavailable",
      message: "Copilot service was unavailable. Review skipped without failing the workflow.",
      status: error.status,
      errorCode: error.errorCode ?? null,
      impactLevel: input.impactLevel,
      maxPatchCharacters: input.maxPatchCharacters,
      maxFileCharacters: input.maxFileCharacters,
      skipDirectories: input.skipDirectories
    })
  );
}

async function run(): Promise<void> {
  const eventName = github.context.eventName;
  if (eventName !== "pull_request" && eventName !== "pull_request_target") {
    core.info(`Skipping event '${eventName}'. This action only runs on pull request events.`);
    return;
  }

  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest?.number || !pullRequest.head?.sha) {
    throw new Error("Missing pull request data from GitHub context.");
  }

  const inputs = parseInputs();
  const octokit = github.getOctokit(inputs.githubToken);
  const pullRequestClient = new GitHubPullRequestClient(octokit);
  const analyzer = new CopilotModelsClient({
    token: inputs.githubToken,
    apiUrl: inputs.copilotApiUrl,
    model: inputs.model
  });
  const service = new PerformanceReviewService(pullRequestClient, analyzer, {
    minSeverity: inputs.minSeverity,
    minConfidence: inputs.minConfidence,
    minImpactScore: inputs.minImpactScore,
    maxFindingsPerFile: inputs.maxFindingsPerFile,
    maxPatchCharacters: inputs.maxPatchCharacters,
    maxFileCharacters: inputs.maxFileCharacters,
    skipGeneratedArtifacts: inputs.skipGeneratedArtifacts,
    skipDirectories: inputs.skipDirectories,
    reviewSummary: inputs.reviewSummary
  });

  let result: Awaited<ReturnType<PerformanceReviewService["reviewPullRequest"]>>;
  try {
    result = await service.reviewPullRequest({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pullNumber: pullRequest.number,
      headSha: pullRequest.head.sha
    });
  } catch (error) {
    if (error instanceof CopilotModelAccessError) {
      setModelAccessDeniedOutputs(inputs);
      return;
    }
    if (error instanceof CopilotServiceUnavailableError) {
      setCopilotUnavailableOutputs(inputs, error);
      return;
    }
    throw error;
  }

  core.setOutput("supported-files-detected", result.supportedFilesDetected.toString());
  core.setOutput("analyzed-files", result.analyzedFiles.toString());
  core.setOutput("comments-posted", result.commentsPosted.toString());
  core.setOutput("skipped-reason", result.skippedReason ?? "");

  const analysisOverviewContext: AnalysisOverviewContext = {
    model: inputs.model,
    minSeverity: inputs.minSeverity,
    minConfidence: inputs.minConfidence,
    impactLevel: inputs.impactLevel,
    minImpactScore: inputs.minImpactScore,
    maxPatchCharacters: inputs.maxPatchCharacters,
    maxFileCharacters: inputs.maxFileCharacters,
    skipGeneratedArtifacts: inputs.skipGeneratedArtifacts,
    skipDirectories: inputs.skipDirectories,
    result
  };
  core.setOutput(
    "analysis-overview",
    JSON.stringify(buildAnalysisOverviewOutput(analysisOverviewContext))
  );
  logAnalysisOverview(analysisOverviewContext);

  await upsertSkippedFilesComment({
    octokit,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pullNumber: pullRequest.number,
    model: inputs.model,
    maxPatchCharacters: inputs.maxPatchCharacters,
    maxFileCharacters: inputs.maxFileCharacters,
    skipDirectories: inputs.skipDirectories,
    skippedFiles: result.skippedFiles
  });

  if (result.skippedReason === "no_supported_languages") {
    core.info("No supported languages detected in this PR. Copilot analysis was skipped.");
  } else if (result.skippedReason === "all_supported_files_skipped") {
    core.info("All supported files were skipped before model analysis due to skip rules.");
  } else if (result.skippedReason === "no_high_value_findings") {
    core.info("No high-value performance findings were detected.");
  } else {
    core.info(`Posted ${result.commentsPosted} inline performance review comments.`);
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  core.setFailed(message);
});
