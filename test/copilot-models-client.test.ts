import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalyzeFileInput } from "../src/application/ports";
import {
  CopilotModelAccessError,
  CopilotModelsClient
} from "../src/infrastructure/copilot-models-client";

const analyzeInput: AnalyzeFileInput = {
  owner: "o",
  repo: "r",
  pullNumber: 1,
  path: "src/file.ts",
  language: "typescript",
  patch: "@@ -1,0 +1,1 @@\n+const x = 1;",
  content: "const x = 1;",
  activeLanguages: ["typescript"],
  maxFindingsPerFile: 3
};

describe("copilot models client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses model response into findings", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  findings: [
                    {
                      title: "N+1 map lookup in loop",
                      issue: "Repeated lookup in loop body.",
                      whyItMatters: "This grows with list size.",
                      recommendation: "Precompute lookup map outside loop.",
                      complexity: "O(n*m) to O(n+m).",
                      severity: "high",
                      confidence: "high",
                      impactScore: 4,
                      line: 1,
                      symbolName: "expensive",
                      symbolKind: "function"
                    }
                  ]
                })
              }
            }
          ]
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new CopilotModelsClient({
      token: "token",
      apiUrl: "https://example.test/chat",
      model: "test-model"
    });

    const findings = await client.analyzeFile(analyzeInput);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("high");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on invalid JSON response payload", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "not json"
              }
            }
          ]
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new CopilotModelsClient({
      token: "token",
      apiUrl: "https://example.test/chat",
      model: "test-model"
    });

    await expect(client.analyzeFile(analyzeInput)).rejects.toThrow(
      "Copilot response was not valid JSON."
    );
  });

  it("supports array-form message content", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  {
                    type: "text",
                    text: undefined
                  },
                  {
                    type: "text",
                    text: `\`\`\`json
${JSON.stringify({
  findings: []
})}
\`\`\``
                  }
                ]
              }
            }
          ]
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    const client = new CopilotModelsClient({
      token: "token",
      apiUrl: "https://example.test/chat",
      model: "test-model"
    });

    const findings = await client.analyzeFile(analyzeInput);
    expect(findings).toEqual([]);
  });

  it("throws when API call fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("boom", { status: 500 });
    });

    vi.stubGlobal("fetch", fetchMock);
    const client = new CopilotModelsClient({
      token: "token",
      apiUrl: "https://example.test/chat",
      model: "test-model"
    });

    await expect(client.analyzeFile(analyzeInput)).rejects.toThrow("Copilot request failed (500)");
  });

  it("throws model access error when model is denied", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "no_access",
            message: "No access to model"
          }
        }),
        { status: 403 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    const client = new CopilotModelsClient({
      token: "token",
      apiUrl: "https://example.test/chat",
      model: "blocked-model"
    });

    await expect(client.analyzeFile(analyzeInput)).rejects.toBeInstanceOf(CopilotModelAccessError);
  });

  it("throws when response has no content", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: {} }]
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    const client = new CopilotModelsClient({
      token: "token",
      apiUrl: "https://example.test/chat",
      model: "test-model"
    });

    await expect(client.analyzeFile(analyzeInput)).rejects.toThrow(
      "Copilot response did not include message content."
    );
  });
});
