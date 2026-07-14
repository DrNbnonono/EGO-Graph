import { z } from "zod";
import { createHash } from "node:crypto";
import type { ToolDefinition } from "../../tool-definition.js";
import { enforceEgressAllowlist, redactSecrets, DEFAULT_EGRESS_POLICY } from "../sandbox/boundary.js";
import {
  authorizeSecurityRequest,
  consumeSecurityRequest,
  type SecurityScopeV2,
} from "@ego-graph/security-tools";

/**
 * Web security tool adapters (security.web.*).
 *
 * All network-facing tools enforce the egress allowlist (default: loopback
 * only, matching the fixture-only authorization posture) and redact secrets
 * from output before evidence mapping. Real crawling/headers/params logic
 * lives here in pure TS so CI can exercise it without a live target.
 */

const crawlInput = z.object({
  url: z.string().url(),
  depth: z.number().int().min(1).max(3).optional(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  headers: z.record(z.string()).default({}),
});
const webOutput = z.object({
  findings: z.array(z.string()),
  url: z.string(),
  status: z.number().optional(),
  headers: z.record(z.string()).optional(),
  links: z.array(z.string()).optional(),
  forms: z.array(z.record(z.string())).optional(),
  bodyPreview: z.string().optional(),
  requestHash: z.string().optional(),
  responseHash: z.string().optional(),
});

export type WebFetchOptions = {
  fetcher?: typeof fetch;
  egressAllowlist?: string[];
};

function makeWebTool(
  name: string,
  description: string,
  requiredAction: string,
  run: (input: { url: string; fetcher: typeof fetch; response: Response }) => Promise<z.infer<typeof webOutput>>,
  options: WebFetchOptions,
): ToolDefinition<typeof crawlInput, typeof webOutput> {
  const fetcher = options.fetcher ?? fetch;
  return {
    name,
    description,
    inputSchema: crawlInput,
    outputSchema: webOutput,
    permission: { scope: "network", risk: "low", requiresSandbox: false },
    permissionAction: requiredAction,
    riskLevel: "low",
    sandboxProfile: "none",
    requiresSecurityScope: true,
    requiresApproval: true,
    timeoutMs: 15_000,
    evidenceMapper(output) {
      return [
        { summary: output.findings[0] ?? `${name} on ${output.url}`, kind: "fact" as const, confidence: 0.6, raw: { url: output.url, status: output.status } },
      ];
    },
    async execute(input, context) {
      const policy = { ...DEFAULT_EGRESS_POLICY, allowlist: options.egressAllowlist ?? [] };
      const egress = enforceEgressAllowlist(input.url, policy);
      if (!egress.allowed) {
        return {
          findings: [`Egress denied: ${egress.reason}`],
          url: input.url,
        };
      }
      const scope = context.securityScope as SecurityScopeV2 | undefined;
      const authorization = authorizeSecurityRequest({ scope, url: input.url, method: input.method });
      if (!authorization.allowed) {
        return { findings: [`Scope denied: ${authorization.reason}`], url: input.url };
      }
      consumeSecurityRequest(scope!);
      const response = await fetcher(input.url, {
        method: input.method,
        headers: input.headers,
        redirect: "manual",
        ...(context.signal ? { signal: context.signal } : {}),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const redirected = new URL(location, input.url).toString();
          const redirectAuthorization = authorizeSecurityRequest({ scope, url: redirected, method: "GET" });
          if (!redirectAuthorization.allowed || scope!.limits.maxRedirects < 1) {
            return { findings: [`Redirect denied: ${redirectAuthorization.allowed ? "redirect budget is zero" : redirectAuthorization.reason}`], url: input.url, status: response.status };
          }
        }
      }
      const result = await run({ url: input.url, fetcher, response });
      result.requestHash = createHash("sha256")
        .update(JSON.stringify({ url: input.url, method: input.method, headers: input.headers }))
        .digest("hex");
      const responseHeaders: Array<[string, string]> = [];
      response.headers.forEach((value, key) => responseHeaders.push([key, value]));
      result.responseHash = createHash("sha256")
        .update(JSON.stringify({ status: response.status, headers: responseHeaders, bodyPreview: result.bodyPreview ?? "" }))
        .digest("hex");
      if (result.bodyPreview && Buffer.byteLength(result.bodyPreview, "utf8") > scope!.limits.maxResponseBytes) {
        result.bodyPreview = result.bodyPreview.slice(0, scope!.limits.maxResponseBytes);
      }
      return redactSecrets(result);
    },
  };
}

export function createWebSecurityToolRegistry(_options: WebFetchOptions = {}): {
  tools: ToolDefinition<typeof crawlInput, typeof webOutput>[];
} {
  const crawl = makeWebTool(
    "security.web.crawl",
    "Crawl an authorized web fixture and collect links/title/body preview.",
    "inspect",
    async ({ url, response }) => {
      const body = await response.text();
      const links = extractLinks(body, url);
      return {
        findings: [`Crawled ${url}: HTTP ${response.status}, ${links.length} link(s).`],
        url,
        status: response.status,
        links,
        bodyPreview: body.slice(0, 2_000),
      };
    },
    _options,
  );
  const headers = makeWebTool(
    "security.web.headers",
    "Collect and fingerprint HTTP response headers for an authorized target.",
    "fingerprint",
    async ({ url, response }) => {
      const headerRecord: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerRecord[key] = value;
      });
      const hints = fingerprintHeaders(headerRecord);
      return {
        findings: [`Headers for ${url}: ${hints.join(", ") || "no fingerprint hints"}.`],
        url,
        status: response.status,
        headers: headerRecord,
      };
    },
    _options,
  );
  const forms = makeWebTool(
    "security.web.forms",
    "Extract form metadata (action, method, inputs) from an authorized target.",
    "inspect",
    async ({ url, response }) => {
      const body = await response.text();
      const parsedForms = parseForms(body);
      return {
        findings: [`Found ${parsedForms.length} form(s) on ${url}.`],
        url,
        status: response.status,
        forms: parsedForms,
      };
    },
    _options,
  );
  const params = makeWebTool(
    "security.web.params",
    "Enumerate query-string and form parameter injection points for an authorized target.",
    "inspect",
    async ({ url, response }) => {
      const body = await response.text();
      const parsedForms = parseForms(body);
      const parsedUrl = new URL(url);
      const queryParams = [...parsedUrl.searchParams.keys()];
      const paramPoints = [
        ...queryParams.map((name) => ({ source: "query", name })),
        ...parsedForms.flatMap((form) =>
          (form.inputs ?? "").split(",").filter(Boolean).map((name) => ({ source: form.action ?? "form", name })),
        ),
      ];
      return {
        findings: [`Parameter injection points on ${url}: ${paramPoints.length} (query: ${queryParams.length}).`],
        url,
        status: response.status,
        forms: paramPoints as unknown as Array<Record<string, string>>,
      };
    },
    _options,
  );
  return { tools: [crawl, headers, forms, params] };
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/\bhref=["']([^"']+)["']/giu)) {
    const href = match[1];
    if (!href) {
      continue;
    }
    try {
      const resolved = new URL(href, baseUrl);
      links.add(`${resolved.pathname}${resolved.search}`);
    } catch {
      // ignore malformed
    }
  }
  return [...links].slice(0, 50);
}

function fingerprintHeaders(headers: Record<string, string>): string[] {
  const hints: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (["server", "x-powered-by", "x-aspnet-version"].includes(name.toLowerCase())) {
      hints.push(`${name}: ${value}`);
    }
  }
  return hints.slice(0, 10);
}

function parseForms(html: string): Array<Record<string, string>> {
  const forms: Array<Record<string, string>> = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/giu)) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const action = /action=["']([^"']+)["']/iu.exec(attrs)?.[1] ?? "";
    const method = /method=["']([^"']+)["']/iu.exec(attrs)?.[1] ?? "GET";
    const inputs = [...inner.matchAll(/<input\b[^>]*name=["']?([^"'\s>]+)/giu)]
      .map((inputMatch) => inputMatch[1] ?? "")
      .filter(Boolean);
    forms.push({ action, method: method.toUpperCase(), inputs: inputs.join(",") });
  }
  return forms.slice(0, 20);
}
