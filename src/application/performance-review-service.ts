import { formatInlineComment } from "./comment-formatter";
import { resolveFindingLine } from "./line-targeting";
import type { PerformanceAnalyzer, PullRequestClient } from "./ports";
import { filterFindings } from "../domain/finding-filter";
import { classifySupportedFiles } from "../domain/language-classifier";
import type { InlineReviewComment, Severity, Confidence } from "../domain/types";

export interface PerformanceReviewServiceOptions {
  minSeverity: Severity;
  minConfidence: Confidence;
  minImpactScore: number;
  maxFindingsPerFile: number;
  reviewSummary: string;
}

export interface ReviewPullRequestRequest {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
}

export interface ReviewPullRequestResult {
  supportedFilesDetected: number;
  analyzedFiles: number;
  commentsPosted: number;
  skippedReason?: "no_supported_languages" | "no_high_value_findings";
}

function dedupeComments(comments: InlineReviewComment[]): InlineReviewComment[] {
  const seen = new Set<string>();
  const deduped: InlineReviewComment[] = [];

  for (const comment of comments) {
    const key = `${comment.path}:${comment.line}:${comment.body}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(comment);
  }

  return deduped;
}

export class PerformanceReviewService {
  public constructor(
    private readonly pullRequestClient: PullRequestClient,
    private readonly analyzer: PerformanceAnalyzer,
    private readonly options: PerformanceReviewServiceOptions
  ) {}

  public async reviewPullRequest(
    request: ReviewPullRequestRequest
  ): Promise<ReviewPullRequestResult> {
    const changedFiles = await this.pullRequestClient.listPullRequestFiles({
      owner: request.owner,
      repo: request.repo,
      pullNumber: request.pullNumber
    });

    const supportedFiles = classifySupportedFiles(changedFiles).filter(
      (file) => file.status !== "removed"
    );

    if (supportedFiles.length === 0) {
      return {
        supportedFilesDetected: 0,
        analyzedFiles: 0,
        commentsPosted: 0,
        skippedReason: "no_supported_languages"
      };
    }

    const activeLanguages = [...new Set(supportedFiles.map((file) => file.language))];
    const comments: InlineReviewComment[] = [];
    let analyzedFiles = 0;

    for (const file of supportedFiles) {
      const content = await this.pullRequestClient.getFileContent({
        owner: request.owner,
        repo: request.repo,
        path: file.path,
        ref: request.headSha
      });

      const rawFindings = await this.analyzer.analyzeFile({
        owner: request.owner,
        repo: request.repo,
        pullNumber: request.pullNumber,
        path: file.path,
        language: file.language,
        patch: file.patch,
        content,
        activeLanguages,
        maxFindingsPerFile: this.options.maxFindingsPerFile
      });

      analyzedFiles += 1;

      const highValueFindings = filterFindings(rawFindings, {
        minSeverity: this.options.minSeverity,
        minConfidence: this.options.minConfidence,
        minImpactScore: this.options.minImpactScore
      }).slice(0, this.options.maxFindingsPerFile);

      for (const finding of highValueFindings) {
        const line = resolveFindingLine({
          finding,
          language: file.language,
          content,
          patch: file.patch
        });
        if (!line) {
          continue;
        }

        comments.push({
          path: file.path,
          line,
          body: formatInlineComment(finding)
        });
      }
    }

    const dedupedComments = dedupeComments(comments);

    if (dedupedComments.length === 0) {
      return {
        supportedFilesDetected: supportedFiles.length,
        analyzedFiles,
        commentsPosted: 0,
        skippedReason: "no_high_value_findings"
      };
    }

    await this.pullRequestClient.submitInlineReview({
      owner: request.owner,
      repo: request.repo,
      pullNumber: request.pullNumber,
      commitId: request.headSha,
      body: this.options.reviewSummary,
      comments: dedupedComments
    });

    return {
      supportedFilesDetected: supportedFiles.length,
      analyzedFiles,
      commentsPosted: dedupedComments.length
    };
  }
}
