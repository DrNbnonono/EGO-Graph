import {z} from "zod";

export const trajectoryEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  timestamp: z.string().datetime(),
  type: z.enum([
    "task.parsed",
    "graph.created",
    "safety.checked",
    "tool.started",
    "tool.completed",
    "evidence.created",
    "report.created",
    "run.completed",
    "run.blocked",
  ]),
  message: z.string().min(1),
  data: z.record(z.unknown()).default({}),
});

export type TrajectoryEvent = z.output<typeof trajectoryEventSchema>;

export function createTrajectoryEvent(
  runId: string,
  type: TrajectoryEvent["type"],
  message: string,
  data: Record<string, unknown> = {},
): TrajectoryEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    runId,
    timestamp: new Date().toISOString(),
    type,
    message,
    data,
  };
}
