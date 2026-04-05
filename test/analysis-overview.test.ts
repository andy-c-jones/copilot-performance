import * as core from "@actions/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAnalysisOverviewOutput,
  logAnalysisOverview
} from "../src/application/analysis-overview";

const sampleResult = {
  supportedFilesDetected: 2,
  analyzedFiles: 1,
  commentsPosted: 0,
  activeLanguages: ["typescript"] as const,
  totalRawFindings: 2,
  totalHighValueFindings: 0,
  analysisTrace: [
    {
      path: "src/a.ts",
      language: "typescript" as const,
      rawFindings: 2,
      highValueFindings: 0,
      commentsPrepared: 0
    }
  ],
  skippedFiles: [
    {
      path: "dist/index.js",
      language: "javascript" as const,
      reason: "generated_artifact" as const
    }
  ],
  skippedReason: "no_high_value_findings" as const
};

describe("analysis overview helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds structured analysis overview output", () => {
    const output = buildAnalysisOverviewOutput({
      model: "openai/gpt-4.1",
      minSeverity: "medium",
      minConfidence: "high",
      minImpactScore: 3,
      maxPatchCharacters: 6000,
      maxFileCharacters: 12000,
      skipGeneratedArtifacts: true,
      skipDirectoriesForJavaScriptAndTypeScript: ["dist"],
      result: sampleResult
    });

    expect(output).toMatchObject({
      model: "openai/gpt-4.1",
      limits: {
        maxPatchCharacters: 6000,
        maxFileCharacters: 12000,
        skipGeneratedArtifacts: true,
        skipDirectoriesForJavaScriptAndTypeScript: ["dist"]
      },
      skippedFiles: [{ path: "dist/index.js" }]
    });
  });

  it("logs a readable analysis overview", () => {
    const infoSpy = vi.spyOn(core, "info").mockImplementation(() => {});
    vi.spyOn(core, "startGroup").mockImplementation(() => {});
    vi.spyOn(core, "endGroup").mockImplementation(() => {});

    logAnalysisOverview({
      model: "openai/gpt-4.1",
      minSeverity: "medium",
      minConfidence: "high",
      minImpactScore: 3,
      maxPatchCharacters: 6000,
      maxFileCharacters: 12000,
      skipGeneratedArtifacts: true,
      skipDirectoriesForJavaScriptAndTypeScript: ["dist"],
      result: sampleResult
    });

    expect(infoSpy).toHaveBeenCalledWith("Model: openai/gpt-4.1");
    expect(infoSpy).toHaveBeenCalledWith("JS/TS skip directories: dist");
    expect(infoSpy).toHaveBeenCalledWith("Files skipped before model call: 1");
  });

  it("logs skipped-trace entries and no-check path", () => {
    const infoSpy = vi.spyOn(core, "info").mockImplementation(() => {});
    vi.spyOn(core, "startGroup").mockImplementation(() => {});
    vi.spyOn(core, "endGroup").mockImplementation(() => {});

    logAnalysisOverview({
      model: "openai/gpt-4.1",
      minSeverity: "medium",
      minConfidence: "high",
      minImpactScore: 3,
      maxPatchCharacters: 6000,
      maxFileCharacters: 12000,
      skipGeneratedArtifacts: false,
      skipDirectoriesForJavaScriptAndTypeScript: [],
      result: {
        ...sampleResult,
        activeLanguages: [],
        analysisTrace: [
          {
            path: "dist/index.js",
            language: "javascript",
            rawFindings: 0,
            highValueFindings: 0,
            commentsPrepared: 0,
            skippedReason: "generated_artifact"
          }
        ]
      }
    });

    expect(infoSpy).toHaveBeenCalledWith("Skip generated artifacts: disabled");
    expect(infoSpy).toHaveBeenCalledWith("Languages analyzed: none");
    expect(infoSpy).toHaveBeenCalledWith(
      "- dist/index.js (javascript): skipped=generated_artifact"
    );
  });
});
