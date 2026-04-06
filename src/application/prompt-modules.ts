import type { SupportedLanguage } from "../domain/types";

export interface PromptModule {
  language: SupportedLanguage;
  focusAreas: string[];
  checkLabels: string[];
}

const MODULES: Record<SupportedLanguage, PromptModule> = {
  javascript: {
    language: "javascript",
    checkLabels: [
      "Big-O complexity and nested iteration hotspots",
      "Repeated work in render/lifecycle paths",
      "React re-render churn and unstable dependencies",
      "Web Components lifecycle and DOM query costs",
      "Async concurrency and event-loop blocking hotspots",
      "Allocation churn from hot-path cloning and formatter recreation"
    ],
    focusAreas: [
      "For React code, inspect render-path costs, repeated expensive computation inside render, unstable dependency arrays, and unnecessary re-renders caused by props identity churn.",
      "For Web Components, inspect lifecycle callback hotspots, repeated DOM querying, large synchronous layout/reflow triggers, and listener leaks in connected/disconnected flows.",
      "For general JavaScript, flag await-in-loop patterns that should be batched with Promise.all, synchronous APIs that block the event loop in request paths, repeated deep cloning/parsing, and expensive formatter/RegExp construction inside hot functions."
    ]
  },
  typescript: {
    language: "typescript",
    checkLabels: [
      "Big-O complexity and nested iteration hotspots",
      "Repeated data shaping and serialization overhead",
      "Runtime allocation pressure from intermediate objects/arrays",
      "Runtime validation and decorator transform overhead in hot paths",
      "Hidden multi-pass utility pipelines over large collections"
    ],
    focusAreas: [
      "Apply the same JavaScript runtime performance checks while considering TypeScript abstractions that can hide expensive runtime loops.",
      "Pay special attention to repeated data shaping, serialization/deserialization in hot paths, and avoid over-allocating intermediate arrays/objects.",
      "Flag repeated runtime schema validation or metadata-driven mapping (for example zod/class-transformer style transforms) in hot paths, and chained utility pipelines that repeatedly materialize arrays/objects."
    ]
  },
  csharp: {
    language: "csharp",
    checkLabels: [
      "EF/NHibernate query materialization and loading strategy overhead",
      "LINQ deferred execution and multiple-enumeration pitfalls",
      ".NET logging template, allocation, and serialization overhead",
      "Data-access query complexity and over-fetching",
      "Sync-over-async and thread-pool starvation risks",
      "Per-request allocation and expensive object lifetime mistakes"
    ],
    focusAreas: [
      "For EF and NHibernate, check tracking/no-tracking choices, query materialization timing, Include over-fetching, lazy/eager loading tradeoffs, session usage patterns, and batching opportunities.",
      "For LINQ, check repeated enumeration of IEnumerable, premature ToList/ToArray materialization, Count() used only for existence checks, and filter/sort/projection ordering that expands work.",
      "For .NET logging, flag interpolated/concatenated messages in hot paths, expensive argument construction or serialization when log levels are disabled, and suggest structured templates or LoggerMessage patterns where appropriate.",
      "For async flows, flag .Result/.Wait and other sync-over-async patterns that can block threads, plus sequential awaits where independent operations could run concurrently.",
      "For runtime costs, flag per-request creation of expensive objects (for example HttpClient, Regex, JsonSerializerOptions), closure capture/boxing in hot loops, and suggest reuse or pooling."
    ]
  }
};

export function getPromptModulesForLanguages(languages: SupportedLanguage[]): PromptModule[] {
  const uniqueLanguages = [...new Set(languages)];
  return uniqueLanguages.map((language) => MODULES[language]);
}

export function getPerformanceCheckLabelsForLanguages(languages: SupportedLanguage[]): string[] {
  const modules = getPromptModulesForLanguages(languages);
  return [...new Set(modules.flatMap((module) => module.checkLabels))];
}
