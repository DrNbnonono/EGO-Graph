export type TerminalSize = {
  columns: number;
  rows: number;
};

export type TerminalSizeSource = {
  columns?: number;
  rows?: number;
  on?(event: "resize", listener: () => void): unknown;
  off?(event: "resize", listener: () => void): unknown;
};

export function createTerminalSize(stdout: TerminalSizeSource): TerminalSize {
  return {
    columns: Math.max(60, stdout.columns ?? 100),
    rows: Math.max(24, stdout.rows ?? 32),
  };
}

export function calculateBodyHeight({
  terminalRows,
  statusHeight,
  paletteHeight,
  promptHeight,
}: {
  terminalRows: number;
  statusHeight: number;
  paletteHeight: number;
  promptHeight: number;
}): number {
  return Math.max(8, terminalRows - statusHeight - paletteHeight - promptHeight);
}

export function useTerminalSize(stdout: TerminalSizeSource): TerminalSize {
  return createTerminalSize(stdout);
}
