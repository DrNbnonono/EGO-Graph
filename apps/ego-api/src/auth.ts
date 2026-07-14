import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ApiAuthMode = "required" | "disabled";

export type ApiAuthOptions = {
  mode: ApiAuthMode;
  capabilityToken?: string;
};

export const CAPABILITY_COOKIE = "ego_capability";

export async function ensureCapabilityToken(egoHome: string): Promise<{
  token: string;
  path: string;
}> {
  const path = join(egoHome, "runtime", "api-token");
  const fromEnvironment = process.env.EGO_API_TOKEN?.trim();
  if (fromEnvironment) {
    return { token: fromEnvironment, path: "EGO_API_TOKEN" };
  }
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (existing.length >= 32) {
      await chmod(path, 0o600).catch(() => undefined);
      return { token: existing, path };
    }
  } catch {
    // Create a new runtime capability below.
  }
  const token = randomBytes(32).toString("base64url");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  return { token, path };
}

export function capabilityCookie(token: string): string {
  return `${CAPABILITY_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`;
}

export function requestHasCapability(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim();
  const cookie = parseCookies(request.headers.get("cookie"))[CAPABILITY_COOKIE];
  return safeSecretEqual(bearer ?? cookie ?? "", expectedToken);
}

export function isAllowedLocalHost(request: Request): boolean {
  const rawHost = request.headers.get("host") ?? new URL(request.url).host;
  const hostname = stripPort(rawHost).toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const requestHost = request.headers.get("host") ?? requestUrl.host;
    return (
      (originUrl.protocol === "http:" || originUrl.protocol === "https:") &&
      originUrl.host.toLowerCase() === requestHost.toLowerCase() &&
      isLoopbackHostname(originUrl.hostname)
    );
  } catch {
    return false;
  }
}

export function isPublicAssetPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/health" || pathname === "/favicon.ico" || pathname.startsWith("/assets/");
}

export function capabilityTokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

function parseCookies(value: string | null): Record<string, string> {
  if (!value) return {};
  const result: Record<string, string> = {};
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

function safeSecretEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest) && left.length > 0 && right.length > 0;
}

function stripPort(host: string): string {
  if (host.startsWith("[")) {
    return host.slice(0, host.indexOf("]") + 1);
  }
  return host.split(":", 1)[0] ?? host;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "[::1]" || normalized === "::1";
}
