import type {
  InlineReviewComment,
  PerformanceFinding,
  PullRequestFile,
  SupportedLanguage
} from "../domain/types";

export interface AnalyzeFileInput {
  owner: string;
  repo: string;
  pullNumber: number;
  path: string;
  language: SupportedLanguage;
  patch?: string;
  content: string;
  activeLanguages: SupportedLanguage[];
  maxFindingsPerFile: number;
}

export interface PerformanceAnalyzer {
  analyzeFile(input: AnalyzeFileInput): Promise<PerformanceFinding[]>;
}

export interface SubmitInlineReviewInput {
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
  body: string;
  comments: InlineReviewComment[];
}

export interface PullRequestClient {
  listPullRequestFiles(input: {
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<PullRequestFile[]>;

  getFileContent(input: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
  }): Promise<string>;

  submitInlineReview(input: SubmitInlineReviewInput): Promise<void>;
}
