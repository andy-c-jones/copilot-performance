import { z } from "zod";

import { buildCopilotPrompts } from "../application/prompt-builder";
import type { AnalyzeFileInput, PerformanceAnalyzer } from "../application/ports";
import type { PerformanceFinding } from "../domain/types";

const SeveritySchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(["low", "medium", "high", "critical"]));

const ConfidenceSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(["low", "medium", "high"]));

const SymbolKindSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(["function", "method", "class", "query", "component", "unknown"]))
  .optional();

const FindingSchema = z.object({
  title: z.string().min(1),
  issue: z.string().min(1),
  whyItMatters: z.string().min(1),
  recommendation: z.string().min(1),
  complexity: z.string().min(1),
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  impactScore: z.number().int().min(1).max(5),
  line: z.number().int().positive().optional(),
  symbolName: z.string().min(1).optional(),
  symbolKind: SymbolKindSchema
});

const CopilotResponseSchema = z.object({
  findings: z.array(FindingSchema).default([])
});

interface ChatCompletionChoice {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

export interface CopilotModelsClientOptions {
  token: string;
  apiUrl: string;
  model: string;
}

interface CopilotErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

export class CopilotModelAccessError extends Error {
  public constructor(
    public readonly model: string,
    public readonly status: number,
    public readonly responseBody: string
  ) {
    super(`Copilot model '${model}' is not accessible with the provided token (status ${status}).`);
    this.name = "CopilotModelAccessError";
  }
}

export class CopilotServiceUnavailableError extends Error {
  public constructor(
    public readonly model: string,
    public readonly status: number,
    public readonly responseBody: string,
    public readonly errorCode?: string
  ) {
    const codeSegment = errorCode ? `, code ${errorCode}` : "";
    super(`Copilot service unavailable for model '${model}' (status ${status}${codeSegment}).`);
    this.name = "CopilotServiceUnavailableError";
  }
}

const COPILOT_UNAVAILABLE_ERROR_CODES = new Set([
  "rate_limit_exceeded",
  "tokens_limit_reached",
  "service_unavailable",
  "model_overloaded"
]);

function isCopilotUnavailableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isCopilotUnavailableCode(code: string | undefined): boolean {
  if (!code) {
    return false;
  }
  return COPILOT_UNAVAILABLE_ERROR_CODES.has(code);
}

function extractMessageText(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("");
  }

  throw new Error("Copilot response did not include message content.");
}

function extractJsonPayload(content: string): unknown {
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const rawJson = fencedMatch?.[1] ?? content;

  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error("Copilot response was not valid JSON.", {
      cause: error
    });
  }
}

function parseCopilotErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as CopilotErrorResponse;
    return parsed.error?.code;
  } catch {
    return undefined;
  }
}

export class CopilotModelsClient implements PerformanceAnalyzer {
  public constructor(private readonly options: CopilotModelsClientOptions) {}

  public async analyzeFile(input: AnalyzeFileInput): Promise<PerformanceFinding[]> {
    const prompts = buildCopilotPrompts(input);

    let response: Response;
    try {
      response = await fetch(this.options.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content: prompts.systemPrompt
            },
            {
              role: "user",
              content: prompts.userPrompt
            }
          ]
        })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fetch failure.";
      throw new CopilotServiceUnavailableError(this.options.model, 0, message, "network_error");
    }

    if (!response.ok) {
      const body = await response.text();
      const errorCode = parseCopilotErrorCode(body);
      if (response.status === 403 && errorCode === "no_access") {
        throw new CopilotModelAccessError(this.options.model, response.status, body);
      }
      if (isCopilotUnavailableStatus(response.status) || isCopilotUnavailableCode(errorCode)) {
        throw new CopilotServiceUnavailableError(
          this.options.model,
          response.status,
          body,
          errorCode
        );
      }
      throw new Error(`Copilot request failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = extractMessageText(payload);
    const parsed = extractJsonPayload(content);
    const parsedResponse = CopilotResponseSchema.parse(parsed);

    return parsedResponse.findings.map((finding) => ({
      path: input.path,
      title: finding.title,
      issue: finding.issue,
      whyItMatters: finding.whyItMatters,
      recommendation: finding.recommendation,
      complexity: finding.complexity,
      severity: finding.severity,
      confidence: finding.confidence,
      impactScore: finding.impactScore,
      line: finding.line,
      symbolName: finding.symbolName,
      symbolKind: finding.symbolKind
    }));
  }
}
