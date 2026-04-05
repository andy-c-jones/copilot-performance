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

export class CopilotModelsClient implements PerformanceAnalyzer {
  public constructor(private readonly options: CopilotModelsClientOptions) {}

  public async analyzeFile(input: AnalyzeFileInput): Promise<PerformanceFinding[]> {
    const prompts = buildCopilotPrompts(input);

    const response = await fetch(this.options.apiUrl, {
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

    if (!response.ok) {
      const body = await response.text();
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
