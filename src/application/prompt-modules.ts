import type { SupportedLanguage } from "../domain/types";

export interface PromptModule {
  language: SupportedLanguage;
  focusAreas: string[];
}

const MODULES: Record<SupportedLanguage, PromptModule> = {
  javascript: {
    language: "javascript",
    focusAreas: [
      "For React code, inspect render-path costs, repeated expensive computation inside render, unstable dependency arrays, and unnecessary re-renders caused by props identity churn.",
      "For Web Components, inspect lifecycle callback hotspots, repeated DOM querying, large synchronous layout/reflow triggers, and listener leaks in connected/disconnected flows."
    ]
  },
  typescript: {
    language: "typescript",
    focusAreas: [
      "Apply the same JavaScript runtime performance checks while considering TypeScript abstractions that can hide expensive runtime loops.",
      "Pay special attention to repeated data shaping, serialization/deserialization in hot paths, and avoid over-allocating intermediate arrays/objects."
    ]
  },
  sql: {
    language: "sql",
    focusAreas: [
      "Look for missing selective predicates, non-sargable filters, accidental cartesian products, and expensive functions inside WHERE or JOIN conditions.",
      "Flag N+1 style query patterns inferred from SQL changes and suggest index-aware alternatives."
    ]
  },
  csharp: {
    language: "csharp",
    focusAreas: [
      "For EF, check tracking/no-tracking choices, query materialization timing, Include over-fetching, and client-side evaluation risks.",
      "For NHibernate, check lazy/eager loading tradeoffs, session usage patterns, and query batching opportunities."
    ]
  }
};

export function getPromptModulesForLanguages(languages: SupportedLanguage[]): PromptModule[] {
  const uniqueLanguages = [...new Set(languages)];
  return uniqueLanguages.map((language) => MODULES[language]);
}
