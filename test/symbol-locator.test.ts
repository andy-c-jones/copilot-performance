import { describe, expect, it } from "vitest";

import { locateSymbolDefinitionLine } from "../src/domain/symbol-locator";

describe("symbol locator", () => {
  it("finds JS function definitions", () => {
    const content = [
      "const helper = () => 1;",
      "export function expensiveFn(items) {",
      "  return items.map((item) => item * 2);",
      "}"
    ].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "javascript",
        symbolName: "expensiveFn",
        symbolKind: "function"
      })
    ).toBe(2);
  });

  it("finds C# class definitions", () => {
    const content = [
      "namespace App;",
      "public class UserRepository {",
      "  public int Count() { return 1; }",
      "}"
    ].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "csharp",
        symbolName: "UserRepository",
        symbolKind: "class"
      })
    ).toBe(2);
  });

  it("finds JS class methods", () => {
    const content = [
      "class Worker {",
      "  processItems(items) {",
      "    return items;",
      "  }",
      "}"
    ].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "javascript",
        symbolName: "processItems",
        symbolKind: "method"
      })
    ).toBe(2);
  });

  it("finds JS class definitions", () => {
    const content = ["export class Widget {", "  render() {}", "}"].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "javascript",
        symbolName: "Widget",
        symbolKind: "class"
      })
    ).toBe(1);
  });

  it("uses fallback patterns for unknown symbol kinds", () => {
    const jsContent = ["const runTask = () => true;"].join("\n");
    const csContent = ["public class Runner {}", "public void Run() {}"].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content: jsContent,
        language: "javascript",
        symbolName: "runTask",
        symbolKind: "unknown"
      })
    ).toBe(1);

    expect(
      locateSymbolDefinitionLine({
        content: csContent,
        language: "csharp",
        symbolName: "Run",
        symbolKind: "unknown"
      })
    ).toBe(2);
  });

  it("returns undefined for unsupported language or missing symbol name", () => {
    const content = "select * from users;";

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "sql",
        symbolName: "users",
        symbolKind: "query"
      })
    ).toBeUndefined();

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "typescript",
        symbolName: undefined,
        symbolKind: "function"
      })
    ).toBeUndefined();
  });

  it("normalizes symbol names with call syntax before lookup", () => {
    const content = [
      "const SKIPPED_COMMENT_MARKER = getSkippedFilesCommentMarker();",
      "export async function upsertSkippedFilesComment(input) {",
      "  return input;",
      "}"
    ].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "typescript",
        symbolName: "upsertSkippedFilesComment(input)",
        symbolKind: "function"
      })
    ).toBe(2);
  });

  it("finds C# function symbols as methods", () => {
    const content = ["public class Repo {", "  public async Task SaveAsync() { }", "}"].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "csharp",
        symbolName: "SaveAsync",
        symbolKind: "function"
      })
    ).toBe(2);
  });

  it("returns undefined for empty or non-matching normalized symbols", () => {
    const content = ["export function known() {}", "const other = true;"].join("\n");

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "typescript",
        symbolName: "   ",
        symbolKind: "function"
      })
    ).toBeUndefined();

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "typescript",
        symbolName: "()",
        symbolKind: "function"
      })
    ).toBeUndefined();

    expect(
      locateSymbolDefinitionLine({
        content,
        language: "typescript",
        symbolName: "missingSymbol()",
        symbolKind: "function"
      })
    ).toBeUndefined();
  });
});
