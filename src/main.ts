import * as core from "@actions/core";
import * as github from "@actions/github";

import { getPerformanceCheckLabelsForLanguages } from "./application/prompt-modules";
import { PerformanceReviewService } from "./application/performance-review-service";
import { CONFIDENCE_LEVELS, SEVERITY_LEVELS, type Confidence, type Severity } from "./domain/types";
import {
  CopilotModelAccessError,
  CopilotModelsClient
} from "./infrastructure/copilot-models-client";
import { GitHubPullRequestClient } from "./infrastructure/github-pull-request-client";

const DEFAULT_MODEL = "openai/gpt-4.1";
const DEFAULT_COPILOT_API_URL = "https://models.github.ai/inference/chat/completions";

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

function logAnalysisOverview(input: {
  model: string;
  minSeverity: Severity;
  minConfidence: Confidence;
  minImpactScore: number;
  result: Awaited<ReturnType<PerformanceReviewService["reviewPullRequest"]>>;
}): void {
  const checks = getPerformanceCheckLabelsForLanguages(input.result.activeLanguages);
  const languages = input.result.activeLanguages.join(", ") || "none";

  core.startGroup("Performance analysis overview");
  core.info(`Model: ${input.model}`);
  core.info(
    `Thresholds: severity>=${input.minSeverity}, confidence>=${input.minConfidence}, impact>=${input.minImpactScore}`
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

  for (const fileSummary of input.result.analysisTrace) {
    core.info(
      `- ${fileSummary.path} (${fileSummary.language}): raw=${fileSummary.rawFindings}, high-value=${fileSummary.highValueFindings}, comments-ready=${fileSummary.commentsPrepared}`
    );
  }
  core.endGroup();
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

  const githubToken = core.getInput("github-token", { required: true });
  const model = core.getInput("model") || DEFAULT_MODEL;
  const copilotApiUrl = core.getInput("copilot-api-url") || DEFAULT_COPILOT_API_URL;
  const minSeverity = parseSeverity(core.getInput("min-severity") || "medium");
  const minConfidence = parseConfidence(core.getInput("min-confidence") || "high");
  const minImpactScore = parsePositiveInteger(
    core.getInput("min-impact-score") || "3",
    "min-impact-score"
  );
  const maxFindingsPerFile = parsePositiveInteger(
    core.getInput("max-findings-per-file") || "3",
    "max-findings-per-file"
  );
  const reviewSummary =
    core.getInput("review-summary") ||
    "Performance review suggestions from Copilot. Address only if the impact aligns with your workload profile.";

  const octokit = github.getOctokit(githubToken);
  const pullRequestClient = new GitHubPullRequestClient(octokit);
  const analyzer = new CopilotModelsClient({
    token: githubToken,
    apiUrl: copilotApiUrl,
    model
  });
  const service = new PerformanceReviewService(pullRequestClient, analyzer, {
    minSeverity,
    minConfidence,
    minImpactScore,
    maxFindingsPerFile,
    reviewSummary
  });

  let result;
  try {
    result = await service.reviewPullRequest({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pullNumber: pullRequest.number,
      headSha: pullRequest.head.sha
    });
  } catch (error) {
    if (error instanceof CopilotModelAccessError) {
      core.warning(
        `Skipping Copilot analysis because model access was denied for '${model}'. Ensure the workflow has 'models: read' permission or configure a model your token can access.`
      );
      core.setOutput("supported-files-detected", "0");
      core.setOutput("analyzed-files", "0");
      core.setOutput("comments-posted", "0");
      core.setOutput("skipped-reason", "model_access_denied");
      core.setOutput(
        "analysis-overview",
        JSON.stringify({
          model,
          skippedReason: "model_access_denied",
          message: "Model access denied for the configured token."
        })
      );
      return;
    }
    throw error;
  }

  core.setOutput("supported-files-detected", result.supportedFilesDetected.toString());
  core.setOutput("analyzed-files", result.analyzedFiles.toString());
  core.setOutput("comments-posted", result.commentsPosted.toString());
  core.setOutput("skipped-reason", result.skippedReason ?? "");
  core.setOutput(
    "analysis-overview",
    JSON.stringify({
      model,
      thresholds: {
        minSeverity,
        minConfidence,
        minImpactScore
      },
      activeLanguages: result.activeLanguages,
      supportedFilesDetected: result.supportedFilesDetected,
      analyzedFiles: result.analyzedFiles,
      totalRawFindings: result.totalRawFindings,
      totalHighValueFindings: result.totalHighValueFindings,
      commentsPosted: result.commentsPosted,
      skippedReason: result.skippedReason ?? null,
      analysisTrace: result.analysisTrace
    })
  );

  logAnalysisOverview({
    model,
    minSeverity,
    minConfidence,
    minImpactScore,
    result
  });

  if (result.skippedReason === "no_supported_languages") {
    core.info("No supported languages detected in this PR. Copilot analysis was skipped.");
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
