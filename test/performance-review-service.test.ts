import { describe, expect, it, vi } from "vitest";

import { PerformanceReviewService } from "../src/application/performance-review-service";
import type { PerformanceAnalyzer, PullRequestClient } from "../src/application/ports";
import type { PerformanceFinding, PullRequestFile } from "../src/domain/types";

class FakePullRequestClient implements PullRequestClient {
  public constructor(
    private readonly files: PullRequestFile[],
    private readonly contentByPath: Record<string, string>
  ) {}

  public readonly submittedReviews: Array<{
    owner: string;
    repo: string;
    pullNumber: number;
    commitId: string;
    body: string;
    comments: Array<{ path: string; line: number; body: string }>;
  }> = [];

  public async listPullRequestFiles(): Promise<PullRequestFile[]> {
    return this.files;
  }

  public async getFileContent(input: { path: string }): Promise<string> {
    const content = this.contentByPath[input.path];
    if (!content) {
      throw new Error(`Missing fake content for ${input.path}`);
    }
    return content;
  }

  public async submitInlineReview(input: {
    owner: string;
    repo: string;
    pullNumber: number;
    commitId: string;
    body: string;
    comments: Array<{ path: string; line: number; body: string }>;
  }): Promise<void> {
    this.submittedReviews.push(input);
  }
}

const sampleFinding: PerformanceFinding = {
  path: "src/a.ts",
  title: "Nested loop in hot path",
  issue: "Nested loops process each item repeatedly.",
  whyItMatters: "This scales poorly as item count increases.",
  recommendation: "Use a precomputed lookup map.",
  complexity: "Current path is O(n^2); map-based approach is O(n).",
  severity: "high",
  confidence: "high",
  impactScore: 4,
  symbolName: "processItems",
  symbolKind: "function"
};

const baseOptions = {
  minSeverity: "medium" as const,
  minConfidence: "high" as const,
  minImpactScore: 3,
  maxFindingsPerFile: 3,
  maxPatchCharacters: 6_000,
  maxFileCharacters: 12_000,
  skipGeneratedArtifacts: true,
  skipDirectories: [],
  reviewSummary: "summary"
};

describe("performance review service", () => {
  it("skips Copilot review submission when no supported language files exist", async () => {
    const repoClient = new FakePullRequestClient(
      [{ path: "README.md", status: "modified", additions: 1, deletions: 0 }],
      {}
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, baseOptions);

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    expect(result.skippedReason).toBe("no_supported_languages");
    expect(result.activeLanguages).toEqual([]);
    expect(result.totalRawFindings).toBe(0);
    expect(result.analysisTrace).toEqual([]);
    expect(result.skippedFiles).toEqual([]);
    expect(repoClient.submittedReviews).toHaveLength(0);
    expect(analyzer.analyzeFile).not.toHaveBeenCalled();
  });

  it("submits one inline review with high-value findings", async () => {
    const filePatch = [
      "@@ -1,0 +1,5 @@",
      "+export function processItems(items: number[]) {",
      "+}"
    ].join("\n");
    const repoClient = new FakePullRequestClient(
      [{ path: "src/a.ts", status: "modified", additions: 5, deletions: 0, patch: filePatch }],
      {
        "src/a.ts": "export function processItems(items: number[]) {\n  return items;\n}\n"
      }
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [sampleFinding])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, baseOptions);

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    const firstReview = repoClient.submittedReviews[0];
    expect(result.commentsPosted).toBe(1);
    expect(result.totalRawFindings).toBe(1);
    expect(result.totalHighValueFindings).toBe(1);
    expect(result.activeLanguages).toEqual(["typescript"]);
    expect(result.analysisTrace[0]?.path).toBe("src/a.ts");
    expect(result.skippedFiles).toEqual([]);
    expect(repoClient.submittedReviews).toHaveLength(1);
    expect(firstReview?.body).toContain("<!-- copilot-performance-review -->");
    expect(firstReview?.body).toContain("**Commenting tool:** `andy-c-jones/copilot-performance`");
    expect(firstReview?.body).toContain("summary");
    expect(firstReview?.comments[0]?.line).toBe(1);
  });

  it("does not submit review when findings fail thresholds", async () => {
    const repoClient = new FakePullRequestClient(
      [
        {
          path: "src/a.ts",
          status: "modified",
          additions: 3,
          deletions: 0,
          patch: "@@ -1,0 +1,1 @@\n+1"
        }
      ],
      { "src/a.ts": "const a = 1;\n" }
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [{ ...sampleFinding, severity: "low" as const }])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, baseOptions);

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    expect(result.skippedReason).toBe("no_high_value_findings");
    expect(repoClient.submittedReviews).toHaveLength(0);
  });

  it("deduplicates repeated comments", async () => {
    const repoClient = new FakePullRequestClient(
      [
        {
          path: "src/a.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: "@@ -1,0 +1,1 @@\n+x"
        }
      ],
      { "src/a.ts": "export function processItems() {}\n" }
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [sampleFinding, sampleFinding])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, baseOptions);

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    const firstReview = repoClient.submittedReviews[0];
    expect(result.commentsPosted).toBe(1);
    expect(firstReview?.comments).toHaveLength(1);
  });

  it("skips finding when no comment line can be resolved", async () => {
    const repoClient = new FakePullRequestClient(
      [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
      { "src/a.ts": "const a = 1;\n" }
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [
        {
          ...sampleFinding,
          line: undefined,
          symbolName: undefined,
          symbolKind: undefined
        }
      ])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, baseOptions);

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    expect(result.skippedReason).toBe("no_high_value_findings");
    expect(repoClient.submittedReviews).toHaveLength(0);
  });

  it("skips generated and oversized files before model calls", async () => {
    const repoClient = new FakePullRequestClient(
      [
        { path: "dist/index.js", status: "modified", additions: 10, deletions: 0, patch: "+x" },
        {
          path: "src/huge.ts",
          status: "modified",
          additions: 10,
          deletions: 0,
          patch: `+${"a".repeat(100)}`
        }
      ],
      { "src/huge.ts": "const x = 1;" }
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [sampleFinding])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, {
      ...baseOptions,
      maxPatchCharacters: 50
    });

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    expect(result.skippedReason).toBe("all_supported_files_skipped");
    expect(result.skippedFiles).toHaveLength(2);
    expect(result.skippedFiles[0]?.reason).toBe("generated_artifact");
    expect(result.skippedFiles[1]?.reason).toBe("patch_too_large");
    expect(analyzer.analyzeFile).not.toHaveBeenCalled();
  });

  it("skips configured directories across supported languages", async () => {
    const repoClient = new FakePullRequestClient(
      [
        { path: "dist/skip-me.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" },
        { path: "dist/skip-me.sql", status: "modified", additions: 1, deletions: 0, patch: "+x" }
      ],
      {
        "dist/skip-me.sql": "select 1;"
      }
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, {
      ...baseOptions,
      skipGeneratedArtifacts: false,
      skipDirectories: ["dist"]
    });

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    expect(result.skippedReason).toBe("all_supported_files_skipped");
    expect(result.skippedFiles).toHaveLength(2);
    expect(result.skippedFiles[0]?.path).toBe("dist/skip-me.ts");
    expect(result.skippedFiles[0]?.reason).toBe("directory_rule");
    expect(result.skippedFiles[1]?.path).toBe("dist/skip-me.sql");
    expect(result.skippedFiles[1]?.reason).toBe("directory_rule");
    expect(analyzer.analyzeFile).not.toHaveBeenCalled();
  });

  it("prioritizes configured directory-rule skip over generated-artifact skip", async () => {
    const repoClient = new FakePullRequestClient(
      [{ path: "dist/index.js", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
      {}
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, {
      ...baseOptions,
      skipGeneratedArtifacts: true,
      skipDirectories: ["dist"]
    });

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    expect(result.skippedReason).toBe("all_supported_files_skipped");
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0]?.path).toBe("dist/index.js");
    expect(result.skippedFiles[0]?.reason).toBe("directory_rule");
    expect(analyzer.analyzeFile).not.toHaveBeenCalled();
  });

  it("skips file when content exceeds max file characters", async () => {
    const repoClient = new FakePullRequestClient(
      [{ path: "src/huge.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
      { "src/huge.ts": "x".repeat(500) }
    );
    const analyzer: PerformanceAnalyzer = {
      analyzeFile: vi.fn(async () => [sampleFinding])
    };

    const service = new PerformanceReviewService(repoClient, analyzer, {
      ...baseOptions,
      maxFileCharacters: 100
    });

    const result = await service.reviewPullRequest({
      owner: "o",
      repo: "r",
      pullNumber: 1,
      headSha: "abc"
    });

    expect(result.skippedReason).toBe("all_supported_files_skipped");
    expect(result.skippedFiles[0]?.reason).toBe("file_too_large");
    expect(analyzer.analyzeFile).not.toHaveBeenCalled();
  });
});
