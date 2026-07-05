export type HarnessCheckResult = {
  name: string;
  command: string;
  status: "passed" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
};

export function truncateCheckOutput(value: string, maxChars = 12_000): string {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars))}...`;
}
