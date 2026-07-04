import { cpus, freemem, totalmem } from "node:os";

export type RuntimeMetrics = {
  cpuPercent: number | null;
  memoryRssMb: number;
  systemMemoryPercent: number;
  sampledAt: string;
};

export type RuntimeMetricsSampler = {
  sample(): RuntimeMetrics;
};

export type RuntimeMetricsSamplerDeps = {
  cpuUsage?: () => NodeJS.CpuUsage;
  hrtime?: () => bigint;
  cpuCount?: () => number;
  rssBytes?: () => number;
  totalMemoryBytes?: () => number;
  freeMemoryBytes?: () => number;
};

export function createRuntimeMetricsSampler(
  deps: RuntimeMetricsSamplerDeps = {},
): RuntimeMetricsSampler {
  const readCpuUsage = deps.cpuUsage ?? (() => process.cpuUsage());
  const readHrtime = deps.hrtime ?? (() => process.hrtime.bigint());
  const readCpuCount = deps.cpuCount ?? (() => Math.max(1, cpus().length));
  const readRssBytes = deps.rssBytes ?? (() => process.memoryUsage().rss);
  const readTotalMemory = deps.totalMemoryBytes ?? totalmem;
  const readFreeMemory = deps.freeMemoryBytes ?? freemem;
  let previousUsage: NodeJS.CpuUsage | undefined;
  let previousTime: bigint | undefined;

  return {
    sample() {
      const usage = readCpuUsage();
      const now = readHrtime();
      const totalMemoryBytes = Math.max(1, readTotalMemory());
      const freeMemoryBytes = Math.min(totalMemoryBytes, Math.max(0, readFreeMemory()));
      const memoryRssMb = Math.round(readRssBytes() / 1024 / 1024);
      const systemMemoryPercent = Math.round(
        ((totalMemoryBytes - freeMemoryBytes) / totalMemoryBytes) * 100,
      );
      let cpuPercent: number | null = null;

      if (previousUsage && previousTime !== undefined) {
        const elapsedMicros = Number(now - previousTime) / 1000;
        const usedMicros = usage.user + usage.system - previousUsage.user - previousUsage.system;
        if (elapsedMicros > 0) {
          cpuPercent = roundMetric((usedMicros / elapsedMicros / readCpuCount()) * 100);
        }
      }

      previousUsage = usage;
      previousTime = now;

      return {
        cpuPercent,
        memoryRssMb,
        systemMemoryPercent,
        sampledAt: new Date().toISOString(),
      };
    },
  };
}

function roundMetric(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}
