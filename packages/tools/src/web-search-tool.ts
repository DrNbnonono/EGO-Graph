import { z } from "zod";
import type { ToolDefinition } from "./tool-definition.js";

export type WebSearchFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type WebSearchToolOptions = {
  endpoint?: string;
  fetcher?: WebSearchFetcher;
};

const webSearchInputSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).optional(),
  domains: z.array(z.string()).optional(),
  recencyDays: z.number().int().min(1).optional(),
});

const webSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  publishedAt: z.string().optional(),
});

const webSearchOutputSchema = z.object({
  query: z.string(),
  cached: z.boolean(),
  results: z.array(webSearchResultSchema),
  findings: z.array(z.string()),
});

export type WebSearchTool = ToolDefinition<
  typeof webSearchInputSchema,
  typeof webSearchOutputSchema
>;

export function createWebSearchTool(options: WebSearchToolOptions = {}): WebSearchTool {
  const cache = new Map<string, z.output<typeof webSearchOutputSchema>>();
  const endpoint = options.endpoint ?? "https://api.duckduckgo.com/";
  const fetcher = options.fetcher ?? fetch;

  return {
    name: "web.search",
    description: "Search the public web and return cited snippets for research tasks.",
    inputSchema: webSearchInputSchema,
    outputSchema: webSearchOutputSchema,
    permission: {
      scope: "network",
      risk: "low",
      requiresSandbox: false,
    },
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 15_000,
    async execute(input) {
      const key = JSON.stringify(input);
      const cached = cache.get(key);
      if (cached) {
        return { ...cached, cached: true };
      }

      const url = buildSearchUrl(endpoint, input);
      const response = await fetcher(url);
      if (!response.ok) {
        throw new Error(`web.search failed with HTTP ${response.status}`);
      }
      const raw = (await response.json()) as DuckDuckGoResponse;
      const results = normalizeDuckDuckGoResults(raw).slice(0, input.maxResults ?? 5);
      const output = {
        query: input.query,
        cached: false,
        results,
        findings: results.map((result) => result.snippet).filter(Boolean),
      };
      cache.set(key, output);
      return output;
    },
    evidenceMapper(output) {
      return output.results.map((result) => ({
        summary: result.snippet || result.title,
        kind: "fact",
        confidence: 0.5,
        raw: { url: result.url, title: result.title },
      }));
    },
  };
}

type DuckDuckGoResponse = {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Name?: string;
    Topics?: Array<{ Text?: string; FirstURL?: string }>;
  }>;
};

function buildSearchUrl(endpoint: string, input: z.output<typeof webSearchInputSchema>): string {
  const url = new URL(endpoint);
  url.searchParams.set("q", withDomainFilters(input.query, input.domains));
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  const recency = toDuckDuckGoRecency(input.recencyDays);
  if (recency) {
    url.searchParams.set("df", recency);
  }
  return url.toString();
}

function toDuckDuckGoRecency(recencyDays?: number): string | undefined {
  if (!recencyDays) {
    return undefined;
  }
  if (recencyDays <= 1) {
    return "d";
  }
  if (recencyDays <= 7) {
    return "w";
  }
  if (recencyDays <= 31) {
    return "m";
  }
  return "y";
}

function withDomainFilters(query: string, domains?: string[]): string {
  if (!domains || domains.length === 0) {
    return query;
  }
  return `${query} ${domains.map((domain) => `site:${domain}`).join(" ")}`;
}

function normalizeDuckDuckGoResults(
  raw: DuckDuckGoResponse,
): z.output<typeof webSearchResultSchema>[] {
  const results: z.output<typeof webSearchResultSchema>[] = [];
  if (raw.AbstractText || raw.AbstractURL) {
    results.push({
      title: raw.Heading || raw.AbstractURL || "Search result",
      url: raw.AbstractURL || "https://duckduckgo.com/",
      snippet: raw.AbstractText || raw.Heading || "",
    });
  }

  for (const topic of raw.RelatedTopics ?? []) {
    if (topic.Text && topic.FirstURL) {
      results.push({ title: topic.Name || topic.Text, url: topic.FirstURL, snippet: topic.Text });
    }
    for (const nested of topic.Topics ?? []) {
      if (nested.Text && nested.FirstURL) {
        results.push({ title: nested.Text, url: nested.FirstURL, snippet: nested.Text });
      }
    }
  }

  return results;
}
