import { formatInlineComment } from "./comment-formatter";
import { resolveFindingLine } from "./line-targeting";
import type { PerformanceAnalyzer, PullRequestClient } from "./ports";
import { filterFindings } from "../domain/finding-filter";
import { classifySupportedFiles } from "../domain/language-classifier";
import type { InlineReviewComment, Severity, Confidence, SupportedLanguage } from "../domain/types";

export interface PerformanceReviewServiceOptions {
  minSeverity: Severity;
  minConfidence: Confidence;
  minImpactScore: number;
  maxFindingsPerFile: number;
  maxPatchCharacters: number;
  maxFileCharacters: number;
  skipGeneratedArtifacts: boolean;
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
  activeLanguages: SupportedLanguage[];
  totalRawFindings: number;
  totalHighValueFindings: number;
  analysisTrace: FileAnalysisTrace[];
  skippedFiles: SkippedFileTrace[];
  skippedReason?:
    | "no_supported_languages"
    | "no_high_value_findings"
    | "all_supported_files_skipped";
}

export interface FileAnalysisTrace {
  path: string;
  language: SupportedLanguage;
  rawFindings: number;
  highValueFindings: number;
  commentsPrepared: number;
  skippedReason?: SkippedFileTrace["reason"];
}

export interface SkippedFileTrace {
  path: string;
  language: SupportedLanguage;
  reason: "generated_artifact" | "patch_too_large" | "file_too_large";
  patchCharacters?: number;
  fileCharacters?: number;
}

const GENERATED_ARTIFACT_PATTERNS = [/^dist\//i, /^coverage\//i, /\.map$/i, /\.min\.[^/]+$/i];

function isGeneratedArtifactPath(path: string): boolean {
  return GENERATED_ARTIFACT_PATTERNS.some((pattern) => pattern.test(path));
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
        activeLanguages: [],
        totalRawFindings: 0,
        totalHighValueFindings: 0,
        analysisTrace: [],
        skippedFiles: [],
        skippedReason: "no_supported_languages"
      };
    }

    const activeLanguages = [...new Set(supportedFiles.map((file) => file.language))];
    const comments: InlineReviewComment[] = [];
    const analysisTrace: FileAnalysisTrace[] = [];
    const skippedFiles: SkippedFileTrace[] = [];
    let analyzedFiles = 0;
    let totalRawFindings = 0;
    let totalHighValueFindings = 0;

    for (const file of supportedFiles) {
      if (this.options.skipGeneratedArtifacts && isGeneratedArtifactPath(file.path)) {
        const skippedFile: SkippedFileTrace = {
          path: file.path,
          language: file.language,
          reason: "generated_artifact",
          patchCharacters: file.patch?.length
        };
        skippedFiles.push(skippedFile);
        analysisTrace.push({
          path: file.path,
          language: file.language,
          rawFindings: 0,
          highValueFindings: 0,
          commentsPrepared: 0,
          skippedReason: skippedFile.reason
        });
        continue;
      }

      const patchCharacters = file.patch?.length ?? 0;
      if (patchCharacters > this.options.maxPatchCharacters) {
        const skippedFile: SkippedFileTrace = {
          path: file.path,
          language: file.language,
          reason: "patch_too_large",
          patchCharacters
        };
        skippedFiles.push(skippedFile);
        analysisTrace.push({
          path: file.path,
          language: file.language,
          rawFindings: 0,
          highValueFindings: 0,
          commentsPrepared: 0,
          skippedReason: skippedFile.reason
        });
        continue;
      }

      const content = await this.pullRequestClient.getFileContent({
        owner: request.owner,
        repo: request.repo,
        path: file.path,
        ref: request.headSha
      });

      const fileCharacters = content.length;
      if (fileCharacters > this.options.maxFileCharacters) {
        const skippedFile: SkippedFileTrace = {
          path: file.path,
          language: file.language,
          reason: "file_too_large",
          fileCharacters
        };
        skippedFiles.push(skippedFile);
        analysisTrace.push({
          path: file.path,
          language: file.language,
          rawFindings: 0,
          highValueFindings: 0,
          commentsPrepared: 0,
          skippedReason: skippedFile.reason
        });
        continue;
      }

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
      totalRawFindings += rawFindings.length;

      const highValueFindings = filterFindings(rawFindings, {
        minSeverity: this.options.minSeverity,
        minConfidence: this.options.minConfidence,
        minImpactScore: this.options.minImpactScore
      }).slice(0, this.options.maxFindingsPerFile);
      totalHighValueFindings += highValueFindings.length;

      let commentsPrepared = 0;

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
        commentsPrepared += 1;
      }

      analysisTrace.push({
        path: file.path,
        language: file.language,
        rawFindings: rawFindings.length,
        highValueFindings: highValueFindings.length,
        commentsPrepared
      });
    }

    const dedupedComments = dedupeComments(comments);

    if (dedupedComments.length === 0) {
      return {
        supportedFilesDetected: supportedFiles.length,
        analyzedFiles,
        commentsPosted: 0,
        activeLanguages,
        totalRawFindings,
        totalHighValueFindings,
        analysisTrace,
        skippedFiles,
        skippedReason:
          analyzedFiles === 0 ? "all_supported_files_skipped" : "no_high_value_findings"
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
      commentsPosted: dedupedComments.length,
      activeLanguages,
      totalRawFindings,
      totalHighValueFindings,
      analysisTrace,
      skippedFiles
    };
  }
}
