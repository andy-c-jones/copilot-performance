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
  skipDirectories: string[];
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
  reason: "generated_artifact" | "directory_rule" | "patch_too_large" | "file_too_large";
  patchCharacters?: number;
  fileCharacters?: number;
}

const GENERATED_ARTIFACT_PATTERNS = [/^dist\//i, /^coverage\//i, /\.map$/i, /\.min\.[^/]+$/i];

function isGeneratedArtifactPath(path: string): boolean {
  return GENERATED_ARTIFACT_PATTERNS.some((pattern) => pattern.test(path));
}

function normalizeDirectoryPrefix(prefix: string): string {
  return prefix
    .trim()
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");
}

function shouldSkipByDirectoryRule(path: string, configuredPrefixes: string[]): boolean {
  const normalizedPath = path.replace(/^\.?\//, "");
  const normalizedPrefixes = configuredPrefixes
    .map((prefix) => normalizeDirectoryPrefix(prefix))
    .filter((prefix) => prefix.length > 0);

  return normalizedPrefixes.some((prefix) => {
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  });
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

type SupportedReviewFile = ReturnType<typeof classifySupportedFiles>[number];

interface ReviewState {
  comments: InlineReviewComment[];
  analysisTrace: FileAnalysisTrace[];
  skippedFiles: SkippedFileTrace[];
  analyzedFiles: number;
  totalRawFindings: number;
  totalHighValueFindings: number;
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
    const supportedFiles = await this.getSupportedFiles(request);
    if (supportedFiles.length === 0) {
      return this.buildNoSupportedLanguagesResult();
    }

    const activeLanguages = [...new Set(supportedFiles.map((file) => file.language))];
    const state = this.createInitialState();

    for (const file of supportedFiles) {
      await this.processSupportedFile(file, request, activeLanguages, state);
    }

    const dedupedComments = dedupeComments(state.comments);
    if (dedupedComments.length === 0) {
      return this.buildResult({
        supportedFilesDetected: supportedFiles.length,
        activeLanguages,
        state,
        commentsPosted: 0,
        skippedReason:
          state.analyzedFiles === 0 ? "all_supported_files_skipped" : "no_high_value_findings"
      });
    }

    await this.pullRequestClient.submitInlineReview({
      owner: request.owner,
      repo: request.repo,
      pullNumber: request.pullNumber,
      commitId: request.headSha,
      body: this.options.reviewSummary,
      comments: dedupedComments
    });

    return this.buildResult({
      supportedFilesDetected: supportedFiles.length,
      activeLanguages,
      state,
      commentsPosted: dedupedComments.length
    });
  }

  private async getSupportedFiles(
    request: ReviewPullRequestRequest
  ): Promise<SupportedReviewFile[]> {
    const changedFiles = await this.pullRequestClient.listPullRequestFiles({
      owner: request.owner,
      repo: request.repo,
      pullNumber: request.pullNumber
    });

    return classifySupportedFiles(changedFiles).filter((file) => file.status !== "removed");
  }

  private createInitialState(): ReviewState {
    return {
      comments: [],
      analysisTrace: [],
      skippedFiles: [],
      analyzedFiles: 0,
      totalRawFindings: 0,
      totalHighValueFindings: 0
    };
  }

  private buildNoSupportedLanguagesResult(): ReviewPullRequestResult {
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

  private buildResult(input: {
    supportedFilesDetected: number;
    activeLanguages: SupportedLanguage[];
    state: ReviewState;
    commentsPosted: number;
    skippedReason?: ReviewPullRequestResult["skippedReason"];
  }): ReviewPullRequestResult {
    return {
      supportedFilesDetected: input.supportedFilesDetected,
      analyzedFiles: input.state.analyzedFiles,
      commentsPosted: input.commentsPosted,
      activeLanguages: input.activeLanguages,
      totalRawFindings: input.state.totalRawFindings,
      totalHighValueFindings: input.state.totalHighValueFindings,
      analysisTrace: input.state.analysisTrace,
      skippedFiles: input.state.skippedFiles,
      skippedReason: input.skippedReason
    };
  }

  private async processSupportedFile(
    file: SupportedReviewFile,
    request: ReviewPullRequestRequest,
    activeLanguages: SupportedLanguage[],
    state: ReviewState
  ): Promise<void> {
    const skipTraceBeforeContent = this.getSkipTraceBeforeContent(file);
    if (skipTraceBeforeContent) {
      this.recordSkip(state, skipTraceBeforeContent);
      return;
    }

    const content = await this.pullRequestClient.getFileContent({
      owner: request.owner,
      repo: request.repo,
      path: file.path,
      ref: request.headSha
    });

    const skipTraceAfterContent = this.getSkipTraceAfterContent(file, content);
    if (skipTraceAfterContent) {
      this.recordSkip(state, skipTraceAfterContent);
      return;
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

    state.analyzedFiles += 1;
    state.totalRawFindings += rawFindings.length;

    const highValueFindings = filterFindings(rawFindings, {
      minSeverity: this.options.minSeverity,
      minConfidence: this.options.minConfidence,
      minImpactScore: this.options.minImpactScore
    }).slice(0, this.options.maxFindingsPerFile);
    state.totalHighValueFindings += highValueFindings.length;

    const commentsPrepared = this.prepareComments(file, content, highValueFindings, state.comments);
    state.analysisTrace.push({
      path: file.path,
      language: file.language,
      rawFindings: rawFindings.length,
      highValueFindings: highValueFindings.length,
      commentsPrepared
    });
  }

  private getSkipTraceBeforeContent(file: SupportedReviewFile): SkippedFileTrace | undefined {
    if (this.options.skipGeneratedArtifacts && isGeneratedArtifactPath(file.path)) {
      return {
        path: file.path,
        language: file.language,
        reason: "generated_artifact",
        patchCharacters: file.patch?.length
      };
    }

    if (shouldSkipByDirectoryRule(file.path, this.options.skipDirectories)) {
      return {
        path: file.path,
        language: file.language,
        reason: "directory_rule",
        patchCharacters: file.patch?.length
      };
    }

    const patchCharacters = file.patch?.length ?? 0;
    if (patchCharacters > this.options.maxPatchCharacters) {
      return {
        path: file.path,
        language: file.language,
        reason: "patch_too_large",
        patchCharacters
      };
    }

    return undefined;
  }

  private getSkipTraceAfterContent(
    file: SupportedReviewFile,
    content: string
  ): SkippedFileTrace | undefined {
    const fileCharacters = content.length;
    if (fileCharacters > this.options.maxFileCharacters) {
      return {
        path: file.path,
        language: file.language,
        reason: "file_too_large",
        fileCharacters
      };
    }

    return undefined;
  }

  private recordSkip(state: ReviewState, skippedFile: SkippedFileTrace): void {
    state.skippedFiles.push(skippedFile);
    state.analysisTrace.push({
      path: skippedFile.path,
      language: skippedFile.language,
      rawFindings: 0,
      highValueFindings: 0,
      commentsPrepared: 0,
      skippedReason: skippedFile.reason
    });
  }

  private prepareComments(
    file: SupportedReviewFile,
    content: string,
    highValueFindings: ReturnType<typeof filterFindings>,
    comments: InlineReviewComment[]
  ): number {
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

    return commentsPrepared;
  }
}
