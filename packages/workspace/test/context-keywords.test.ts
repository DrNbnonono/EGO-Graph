import { describe, expect, it } from "vitest";
import { extractTaskKeywords, keywordsToTerms } from "../src/context-keywords.js";

describe("extractTaskKeywords", () => {
  it("extracts English terms filtering stop words", () => {
    const result = extractTaskKeywords({
      goal: "Fix the authentication module in src/auth.ts",
      intent: "code_change",
    });
    expect(result.terms).toContain("fix");
    expect(result.terms).toContain("authentication");
    expect(result.terms).toContain("module");
    // Stop words filtered.
    expect(result.terms).not.toContain("the");
    expect(result.terms).not.toContain("in");
  });

  it("extracts Chinese segments", () => {
    const result = extractTaskKeywords({
      goal: "修复认证模块的bug",
      intent: "code_change",
    });
    // The regex matches continuous CJK runs: "修复认证模块的" is one segment.
    expect(result.terms.some((t) => t.includes("修复认证模块"))).toBe(true);
  });

  it("extracts file path patterns", () => {
    const result = extractTaskKeywords({
      goal: "Look at packages/agent/src/agent-loop.ts and apps/ego-cli/src/cli.ts",
      intent: "project_analysis",
    });
    expect(result.filePatterns.some((p) => p.includes("packages/agent"))).toBe(true);
    expect(result.filePatterns.some((p) => p.includes("apps/ego-cli"))).toBe(true);
  });

  it("extracts single file references", () => {
    const result = extractTaskKeywords({
      goal: "Check the package.json and tsconfig.json",
      intent: "project_analysis",
    });
    expect(result.filePatterns).toContain("package.json");
    expect(result.filePatterns).toContain("tsconfig.json");
  });

  it("extracts PascalCase symbols", () => {
    const result = extractTaskKeywords({
      goal: "Refactor the ChatModelProvider and TerminalAgentSession classes",
      intent: "code_change",
    });
    expect(result.symbolHints).toContain("ChatModelProvider");
    expect(result.symbolHints).toContain("TerminalAgentSession");
  });

  it("extracts camelCase symbols", () => {
    const result = extractTaskKeywords({
      goal: "Update the createTerminalAgentSession function and withRetry wrapper",
      intent: "code_change",
    });
    expect(result.symbolHints).toContain("createTerminalAgentSession");
    expect(result.symbolHints).toContain("withRetry");
  });

  it("extracts snake_case symbols", () => {
    const result = extractTaskKeywords({
      goal: "Fix the shell_command_policy and git_service modules",
      intent: "code_change",
    });
    expect(result.symbolHints).toContain("shell_command_policy");
    expect(result.symbolHints).toContain("git_service");
  });

  it("includes recentToolOutputs and memoryHints", () => {
    const result = extractTaskKeywords({
      goal: "analyze project",
      intent: "project_analysis",
      recentToolOutputs: ["Found vulnerability in lodash dependency"],
      memoryHints: ["User prefers TypeScript strict mode"],
    });
    expect(result.terms).toContain("vulnerability");
    expect(result.terms).toContain("lodash");
    expect(result.terms).toContain("typescript");
  });
});

describe("keywordsToTerms", () => {
  it("flattens all keyword types into a single term array", () => {
    const keywords = extractTaskKeywords({
      goal: "Fix ChatModelProvider in packages/llm/src/provider.ts",
      intent: "code_change",
    });
    const terms = keywordsToTerms(keywords);
    expect(terms.length).toBeGreaterThan(0);
    // Should include general terms.
    expect(terms).toContain("fix");
    // Should include symbol-derived terms.
    expect(terms).toContain("chatmodelprovider");
    // Should include path segment terms.
    expect(terms.some((t) => t === "provider")).toBe(true);
  });

  it("deduplicates terms", () => {
    const keywords = extractTaskKeywords({
      goal: "test test test",
      intent: "chat",
    });
    const terms = keywordsToTerms(keywords);
    const uniqueTerms = [...new Set(terms)];
    expect(terms.length).toBe(uniqueTerms.length);
  });
});
