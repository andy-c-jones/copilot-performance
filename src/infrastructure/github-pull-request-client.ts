import { Buffer } from "node:buffer";

import type { getOctokit } from "@actions/github";

import type { PullRequestClient, SubmitInlineReviewInput } from "../application/ports";
import type { PullRequestFile } from "../domain/types";

type Octokit = ReturnType<typeof getOctokit>;

interface PullRequestFileResponse {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
}

export class GitHubPullRequestClient implements PullRequestClient {
  public constructor(private readonly octokit: Octokit) {}

  public async listPullRequestFiles(input: {
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<PullRequestFile[]> {
    const files = (await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner: input.owner,
      repo: input.repo,
      pull_number: input.pullNumber,
      per_page: 100
    })) as PullRequestFileResponse[];

    return files.map((file) => ({
      path: file.filename,
      status: file.status,
      patch: file.patch,
      additions: file.additions,
      deletions: file.deletions
    }));
  }

  public async getFileContent(input: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
  }): Promise<string> {
    const response = await this.octokit.rest.repos.getContent({
      owner: input.owner,
      repo: input.repo,
      path: input.path,
      ref: input.ref
    });

    const contentResponse = response.data;

    if (Array.isArray(contentResponse)) {
      throw new Error(`Expected file content for ${input.path}, but received a directory.`);
    }

    if (contentResponse.type !== "file") {
      throw new Error(
        `Expected file content for ${input.path}, but received a ${contentResponse.type}.`
      );
    }

    if (
      typeof contentResponse.content !== "string" ||
      typeof contentResponse.encoding !== "string"
    ) {
      throw new Error(`GitHub did not return decodable file content for ${input.path}.`);
    }

    if (contentResponse.encoding !== "base64") {
      throw new Error(
        `Unsupported content encoding for ${input.path}: ${contentResponse.encoding}.`
      );
    }

    return Buffer.from(contentResponse.content, "base64").toString("utf8");
  }

  public async submitInlineReview(input: SubmitInlineReviewInput): Promise<void> {
    await this.octokit.rest.pulls.createReview({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.pullNumber,
      commit_id: input.commitId,
      event: "COMMENT",
      body: input.body,
      comments: input.comments.map((comment) => ({
        path: comment.path,
        line: comment.line,
        side: "RIGHT",
        body: comment.body
      }))
    });
  }
}
