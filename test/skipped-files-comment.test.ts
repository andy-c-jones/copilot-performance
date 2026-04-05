import { describe, expect, it, vi } from "vitest";

import {
  type UpsertSkippedFilesCommentInput,
  upsertSkippedFilesComment
} from "../src/application/skipped-files-comment";

function createFakeOctokit(options?: { existingCommentBody?: string }) {
  const paginate = vi.fn(async () => {
    if (!options?.existingCommentBody) {
      return [];
    }

    return [{ id: 42, body: options.existingCommentBody }];
  });
  const createComment = vi.fn(async () => ({}));
  const updateComment = vi.fn(async () => ({}));

  const octokit = {
    paginate,
    rest: {
      issues: {
        listComments: vi.fn(),
        createComment,
        updateComment
      }
    }
  } as unknown as UpsertSkippedFilesCommentInput["octokit"];

  return { octokit, paginate, createComment, updateComment };
}

const baseInput = {
  owner: "o",
  repo: "r",
  pullNumber: 1,
  model: "openai/gpt-4.1",
  maxPatchCharacters: 6000,
  maxFileCharacters: 12000,
  skipDirectoriesForJavaScriptAndTypeScript: ["dist"],
  skippedFiles: [
    { path: "dist/index.js", language: "javascript" as const, reason: "directory_rule" as const }
  ]
};

describe("skipped files comment helper", () => {
  it("creates a new comment when no existing marker comment is found", async () => {
    const fake = createFakeOctokit();

    await upsertSkippedFilesComment({
      octokit: fake.octokit,
      ...baseInput
    });

    expect(fake.paginate).toHaveBeenCalledTimes(1);
    expect(fake.createComment).toHaveBeenCalledTimes(1);
    expect(fake.updateComment).not.toHaveBeenCalled();
  });

  it("updates existing marker comment when present", async () => {
    const fake = createFakeOctokit({
      existingCommentBody: "<!-- copilot-performance-skipped-files -->\nold"
    });

    await upsertSkippedFilesComment({
      octokit: fake.octokit,
      ...baseInput
    });

    expect(fake.updateComment).toHaveBeenCalledTimes(1);
    expect(fake.createComment).not.toHaveBeenCalled();
  });

  it("does nothing when there are no skipped files", async () => {
    const fake = createFakeOctokit();

    await upsertSkippedFilesComment({
      octokit: fake.octokit,
      ...baseInput,
      skippedFiles: []
    });

    expect(fake.paginate).not.toHaveBeenCalled();
    expect(fake.createComment).not.toHaveBeenCalled();
    expect(fake.updateComment).not.toHaveBeenCalled();
  });

  it("formats all known skip reasons in the comment body", async () => {
    const fake = createFakeOctokit();

    await upsertSkippedFilesComment({
      octokit: fake.octokit,
      ...baseInput,
      skippedFiles: [
        { path: "dist/a.js", language: "javascript", reason: "generated_artifact" },
        {
          path: "src/b.ts",
          language: "typescript",
          reason: "patch_too_large",
          patchCharacters: 9000
        },
        {
          path: "src/c.ts",
          language: "typescript",
          reason: "file_too_large",
          fileCharacters: 12001
        }
      ]
    });

    const createArgs = fake.createComment.mock.calls[0]?.[0];
    expect(createArgs?.body).toContain("generated/bundled artifact path");
    expect(createArgs?.body).toContain("patch exceeds limit");
    expect(createArgs?.body).toContain("file content exceeds limit");
  });

  it("falls back to unknown reason text for unexpected skip reasons", async () => {
    const fake = createFakeOctokit();
    const unexpectedSkipFile = {
      path: "src/weird.ts",
      language: "typescript",
      reason: "mystery"
    } as unknown as UpsertSkippedFilesCommentInput["skippedFiles"][number];

    await upsertSkippedFilesComment({
      octokit: fake.octokit,
      ...baseInput,
      skippedFiles: [unexpectedSkipFile]
    });

    const createArgs = fake.createComment.mock.calls[0]?.[0];
    expect(createArgs?.body).toContain("unknown skip reason");
  });
});
