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
const SKIPPED_COMMENT_MARKER = "<!-- copilot-performance-skipped-files -->";

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

function describeSkippedFileReason(skippedFile: {
  reason: string;
  patchCharacters?: number;
  fileCharacters?: number;
}): string {
  switch (skippedFile.reason) {
    case "generated_artifact":
      return "generated/bundled artifact path";
    case "directory_rule":
      return "matched configured JS/TS skip directory rule";
    case "patch_too_large":
      return `patch exceeds limit (${skippedFile.patchCharacters ?? 0} chars)`;
    case "file_too_large":
      return `file content exceeds limit (${skippedFile.fileCharacters ?? 0} chars)`;
    default:
      return "unknown skip reason";
  }
}

async function upsertSkippedFilesComment(input: {
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  pullNumber: number;
  model: string;
  maxPatchCharacters: number;
  maxFileCharacters: number;
  skipDirectoriesForJavaScriptAndTypeScript: string[];
  skippedFiles: Awaited<ReturnType<PerformanceReviewService["reviewPullRequest"]>>["skippedFiles"];
}): Promise<void> {
  if (input.skippedFiles.length === 0) {
    return;
  }

  const skippedRows = input.skippedFiles
    .map((file) => {
      return `- \`${file.path}\` (${file.language}): ${describeSkippedFileReason(file)}`;
    })
    .join("\n");

  const body = [
    SKIPPED_COMMENT_MARKER,
    "⚠️ Some files were skipped during performance review",
    "",
    `Configured model: \`${input.model}\``,
    `Skip limits: patch <= ${input.maxPatchCharacters} chars, file <= ${input.maxFileCharacters} chars`,
    `JS/TS skip directories: ${input.skipDirectoriesForJavaScriptAndTypeScript.join(", ") || "none"}`,
    "",
    skippedRows
  ].join("\n");

  const existingComments = await input.octokit.paginate(input.octokit.rest.issues.listComments, {
    owner: input.owner,
    repo: input.repo,
    issue_number: input.pullNumber,
    per_page: 100
  });

  const existingComment = existingComments.find((comment) => {
    return typeof comment.body === "string" && comment.body.includes(SKIPPED_COMMENT_MARKER);
  });

  if (existingComment) {
    await input.octokit.rest.issues.updateComment({
      owner: input.owner,
      repo: input.repo,
      comment_id: existingComment.id,
      body
    });
    return;
  }

  await input.octokit.rest.issues.createComment({
    owner: input.owner,
    repo: input.repo,
    issue_number: input.pullNumber,
    body
  });
}

function logAnalysisOverview(input: {
  model: string;
  minSeverity: Severity;
  minConfidence: Confidence;
  minImpactScore: number;
  maxPatchCharacters: number;
  maxFileCharacters: number;
  skipDirectoriesForJavaScriptAndTypeScript: string[];
  result: Awaited<ReturnType<PerformanceReviewService["reviewPullRequest"]>>;
}): void {
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
  const maxPatchCharacters = parsePositiveInteger(
    core.getInput("max-patch-characters") || "6000",
    "max-patch-characters"
  );
  const maxFileCharacters = parsePositiveInteger(
    core.getInput("max-file-characters") || "12000",
    "max-file-characters"
  );
  const skipGeneratedArtifacts = parseBooleanInput(
    core.getInput("skip-generated-artifacts") || "true",
    "skip-generated-artifacts"
  );
  const skipDirectoriesForJavaScriptAndTypeScript = parseCsvInput(
    core.getInput("skip-js-ts-directories") || ""
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
    maxPatchCharacters,
    maxFileCharacters,
    skipGeneratedArtifacts,
    skipDirectoriesForJavaScriptAndTypeScript,
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
          message: "Model access denied for the configured token.",
          maxPatchCharacters,
          maxFileCharacters,
          skipDirectoriesForJavaScriptAndTypeScript
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
      limits: {
        maxPatchCharacters,
        maxFileCharacters,
        skipGeneratedArtifacts,
        skipDirectoriesForJavaScriptAndTypeScript
      },
      activeLanguages: result.activeLanguages,
      supportedFilesDetected: result.supportedFilesDetected,
      analyzedFiles: result.analyzedFiles,
      totalRawFindings: result.totalRawFindings,
      totalHighValueFindings: result.totalHighValueFindings,
      commentsPosted: result.commentsPosted,
      skippedFiles: result.skippedFiles,
      skippedReason: result.skippedReason ?? null,
      analysisTrace: result.analysisTrace
    })
  );

  logAnalysisOverview({
    model,
    minSeverity,
    minConfidence,
    minImpactScore,
    maxPatchCharacters,
    maxFileCharacters,
    skipDirectoriesForJavaScriptAndTypeScript,
    result
  });

  await upsertSkippedFilesComment({
    octokit,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pullNumber: pullRequest.number,
    model,
    maxPatchCharacters,
    maxFileCharacters,
    skipDirectoriesForJavaScriptAndTypeScript,
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
