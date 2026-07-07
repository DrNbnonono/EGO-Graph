/**
 * Structured error type for model request failures.
 *
 * Carries HTTP status code and optional Retry-After hint so the
 * retry-provider can make intelligent retry decisions without parsing
 * error message strings.
 */

export class ModelRequestError extends Error {
  readonly statusCode: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly providerName: string;

  constructor(input: {
    message: string;
    statusCode?: number | undefined;
    retryAfterMs?: number | undefined;
    providerName: string;
  }) {
    super(input.message);
    this.name = "ModelRequestError";
    this.statusCode = input.statusCode;
    this.retryAfterMs = input.retryAfterMs;
    this.providerName = input.providerName;
  }
}

/**
 * Parse an HTTP status code from an error message string.
 * Matches patterns like "Model request failed 429: ..." or "Model stream failed 503: ...".
 */
export function parseStatusCode(message: string): number | undefined {
  const match = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (match?.[1]) {
    const code = parseInt(match[1], 10);
    if (code >= 400 && code <= 599) return code;
  }
  return undefined;
}

/**
 * Parse a Retry-After value (seconds or HTTP-date) into milliseconds.
 */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;

  // Numeric seconds.
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  // HTTP-date.
  const date = Date.parse(value);
  if (!isNaN(date)) {
    const delay = date - Date.now();
    return delay > 0 ? delay : 0;
  }

  return undefined;
}

/**
 * Determine if an HTTP status code is retryable.
 */
export function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504;
}
