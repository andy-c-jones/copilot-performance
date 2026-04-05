import type { AnalyzeFileInput } from "./ports";
import { getPromptModulesForLanguages } from "./prompt-modules";

const MAX_PATCH_CHARACTERS = 12_000;
const MAX_CONTENT_CHARACTERS = 24_000;

function truncate(value: string | undefined, maxLength: number): string {
  if (!value) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...truncated...`;
}

export function buildCopilotPrompts(input: AnalyzeFileInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const modules = getPromptModulesForLanguages(input.activeLanguages);
  const languageFocus = modules
    .map((module) => `- ${module.language}: ${module.focusAreas.join(" ")}`)
    .join("\n");

  const systemPrompt = [
    "You are a senior performance code reviewer for pull requests.",
    "Only report worthwhile, non-trivial performance findings with clear impact.",
    "Analyze time complexity and common performance anti-patterns.",
    "When impact scales with input size, explain scaling behavior explicitly.",
    "Prefer fewer high-value findings over many low-value comments.",
    "If no worthwhile findings exist, return an empty findings array.",
    "",
    "Language-specific focus:",
    languageFocus,
    "",
    "Return strict JSON matching this schema:",
    "{",
    '  "findings": [',
    "    {",
    '      "title": "short summary",',
    '      "issue": "what is wrong",',
    '      "whyItMatters": "why it is a performance issue in this code context",',
    '      "recommendation": "what to do instead",',
    '      "complexity": "Big-O or scaling explanation tied to realistic growth",',
    '      "severity": "low|medium|high|critical",',
    '      "confidence": "low|medium|high",',
    '      "impactScore": 1,',
    '      "line": 1,',
    '      "symbolName": "functionOrClassName",',
    '      "symbolKind": "function|method|class|query|component|unknown"',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Keep findings grounded in changed code.",
    "- Use symbolName and symbolKind for method/function/class issues.",
    "- For method/function/class issues, line should be the top line of the definition when visible."
  ].join("\n");

  const userPrompt = [
    `Repository: ${input.owner}/${input.repo}`,
    `Pull request number: ${input.pullNumber}`,
    `File: ${input.path}`,
    `Language: ${input.language}`,
    "",
    "Patch:",
    truncate(input.patch, MAX_PATCH_CHARACTERS),
    "",
    "File content snapshot:",
    truncate(input.content, MAX_CONTENT_CHARACTERS),
    "",
    `Limit findings to at most ${input.maxFindingsPerFile} for this file.`
  ].join("\n");

  return {
    systemPrompt,
    userPrompt
  };
}
