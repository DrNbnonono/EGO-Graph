/**
 * Enhanced keyword extraction for task context selection.
 *
 * Extracts structured keywords from user input to improve file ranking
 * in the context engine. Supports:
 * - English tokens (>2 chars, stop-word filtered)
 * - Chinese character segments
 * - File path patterns (e.g. "src/foo.ts", "packages/agent")
 * - Symbol names (PascalCase, camelCase, snake_case identifiers)
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ExtractedKeywords = {
  /** General search terms (lowercased English + Chinese segments). */
  terms: string[];
  /** File path patterns extracted from the input (e.g. "src/index.ts"). */
  filePatterns: string[];
  /** Symbol-like identifiers (PascalCase, camelCase, snake_case). */
  symbolHints: string[];
};

export type ExtractInput = {
  goal: string;
  intent: string;
  recentToolOutputs?: string[] | undefined;
  memoryHints?: string[] | undefined;
};

// ── Stop words ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why",
  "how", "all", "each", "every", "both", "few", "more", "most", "other",
  "some", "such", "no", "not", "only", "own", "same", "so", "than",
  "too", "very", "just", "because", "but", "and", "or", "if", "while",
  "that", "this", "these", "those", "what", "which", "who", "whom",
  "please", "help", "want", "need",
]);

// ── Extraction ─────────────────────────────────────────────────────────────

/**
 * Extract structured keywords from task input.
 */
export function extractTaskKeywords(input: ExtractInput): ExtractedKeywords {
  const text = [
    input.goal,
    input.intent,
    ...(input.recentToolOutputs ?? []),
    ...(input.memoryHints ?? []),
  ].join(" ");

  const terms = extractTerms(text);
  const filePatterns = extractFilePatterns(text);
  const symbolHints = extractSymbols(text);

  return { terms, filePatterns, symbolHints };
}

/**
 * Extract general search terms: English tokens and Chinese segments.
 */
function extractTerms(text: string): string[] {
  const terms = new Set<string>();

  // English tokens.
  const englishTokens = text.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? [];
  for (const token of englishTokens) {
    if (!STOP_WORDS.has(token) && !/^\d+$/.test(token)) {
      terms.add(token);
    }
  }

  // Chinese character segments (continuous CJK runs).
  const chineseSegments = text.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const segment of chineseSegments) {
    terms.add(segment);
  }

  return [...terms];
}

/**
 * Extract file path patterns from the input.
 * Matches patterns like "src/index.ts", "packages/agent/src", "foo.test.ts".
 */
function extractFilePatterns(text: string): string[] {
  const patterns: string[] = [];

  // Match path-like patterns: word/word.ext or word/word/word
  const pathMatches = text.match(/\b[\w-]+(?:\/[\w.-]+)+(?:\.\w+)?/g) ?? [];
  for (const match of pathMatches) {
    // Filter out URL-like patterns.
    if (match.startsWith("http") || match.startsWith("//")) continue;
    patterns.push(match);
  }

  // Match single file references: "foo.ts", "bar.test.ts"
  const fileMatches = text.match(/\b[\w-]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml|css|html|py|rs|go)\b/g) ?? [];
  for (const match of fileMatches) {
    if (!patterns.includes(match)) {
      patterns.push(match);
    }
  }

  return [...new Set(patterns)];
}

/**
 * Extract symbol-like identifiers from the input.
 * Matches PascalCase, camelCase, and snake_case names.
 */
function extractSymbols(text: string): string[] {
  const symbols = new Set<string>();

  // PascalCase: starts with uppercase, at least 3 chars.
  const pascalMatches = text.match(/\b[A-Z][a-zA-Z0-9]{2,}\b/g) ?? [];
  for (const match of pascalMatches) {
    if (!STOP_WORDS.has(match.toLowerCase())) {
      symbols.add(match);
    }
  }

  // camelCase: starts with lowercase, has uppercase in middle.
  const camelMatches = text.match(/\b[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*\b/g) ?? [];
  for (const match of camelMatches) {
    symbols.add(match);
  }

  // snake_case: lowercase with underscores, at least 5 chars.
  const snakeMatches = text.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g) ?? [];
  for (const match of snakeMatches) {
    if (match.length >= 5 && !STOP_WORDS.has(match)) {
      symbols.add(match);
    }
  }

  return [...symbols];
}

/**
 * Convert ExtractedKeywords into the flat term array expected by
 * the existing `rankFiles` function in context-engine.
 */
export function keywordsToTerms(keywords: ExtractedKeywords): string[] {
  const terms = new Set<string>();

  for (const term of keywords.terms) {
    terms.add(term);
  }
  // File patterns contribute their path segments.
  for (const pattern of keywords.filePatterns) {
    const segments = pattern.split(/[/._-]/).filter((s) => s.length > 1);
    for (const segment of segments) {
      terms.add(segment.toLowerCase());
    }
  }
  // Symbol hints are lowercased for matching.
  for (const symbol of keywords.symbolHints) {
    terms.add(symbol.toLowerCase());
  }

  return [...terms];
}
