import type { getOctokit } from "@actions/github";

import type { SkippedFileTrace } from "./performance-review-service";

type Octokit = ReturnType<typeof getOctokit>;

const SKIPPED_COMMENT_MARKER = "<!-- copilot-performance-skipped-files -->";

function describeSkippedFileReason(skippedFile: {
  reason: string;
  patchCharacters?: number;
  fileCharacters?: number;
}): string {
  switch (skippedFile.reason) {
    case "generated_artifact":
      return "generated/bundled artifact path";
    case "directory_rule":
      return "matched configured skip directory rule";
    case "patch_too_large":
      return `patch exceeds limit (${skippedFile.patchCharacters ?? 0} chars)`;
    case "file_too_large":
      return `file content exceeds limit (${skippedFile.fileCharacters ?? 0} chars)`;
    default:
      return "unknown skip reason";
  }
}

export interface UpsertSkippedFilesCommentInput {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullNumber: number;
  model: string;
  maxPatchCharacters: number;
  maxFileCharacters: number;
  skipDirectories: string[];
  skippedFiles: SkippedFileTrace[];
}

export async function upsertSkippedFilesComment(
  input: UpsertSkippedFilesCommentInput
): Promise<void> {
  if (input.skippedFiles.length === 0) {
    return;
  }

  const hasNonDirectoryRuleSkip = input.skippedFiles.some(
    (file) => file.reason !== "directory_rule"
  );
  if (!hasNonDirectoryRuleSkip) {
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
    `Skip directories: ${input.skipDirectories.join(", ") || "none"}`,
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
