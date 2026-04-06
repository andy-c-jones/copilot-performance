import type { getOctokit } from "@actions/github";

import { formatSkippedFilesComment, getSkippedFilesCommentMarker } from "./comment-formatter";
import type { SkippedFileTrace } from "./performance-review-service";

type Octokit = ReturnType<typeof getOctokit>;

const SKIPPED_COMMENT_MARKER = getSkippedFilesCommentMarker();

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
  const existingComments = await input.octokit.paginate(input.octokit.rest.issues.listComments, {
    owner: input.owner,
    repo: input.repo,
    issue_number: input.pullNumber,
    per_page: 100
  });

  const existingComment = existingComments.find((comment) => {
    return typeof comment.body === "string" && comment.body.includes(SKIPPED_COMMENT_MARKER);
  });

  const skippedFilesForComment = input.skippedFiles.filter(
    (file) => file.reason !== "directory_rule"
  );

  if (skippedFilesForComment.length === 0) {
    if (!existingComment) {
      return;
    }

    await input.octokit.rest.issues.deleteComment({
      owner: input.owner,
      repo: input.repo,
      comment_id: existingComment.id
    });
    return;
  }

  const body = formatSkippedFilesComment({
    model: input.model,
    maxPatchCharacters: input.maxPatchCharacters,
    maxFileCharacters: input.maxFileCharacters,
    skipDirectories: input.skipDirectories,
    skippedFiles: skippedFilesForComment
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
