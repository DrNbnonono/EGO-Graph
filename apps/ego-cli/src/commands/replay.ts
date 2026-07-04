import { JsonlTrajectoryStore, trajectoryDir } from "@ego-graph/storage";

export async function handleReplayCommand(options: { trajectoryId: string }): Promise<void> {
  const store = new JsonlTrajectoryStore(trajectoryDir());
  const events = await store.readRun(options.trajectoryId);

  console.log(`EGO-Graph replay ${options.trajectoryId}`);
  for (const event of events) {
    console.log(`${event.timestamp} ${event.type} ${event.message}`);

    if (event.type === "decision.made") {
      const decision = event.data.decision as Record<string, unknown> | undefined;
      const toolName = typeof decision?.toolName === "string" ? ` tool=${decision.toolName}` : "";
      console.log(`  decision=${String(decision?.type ?? "unknown")}${toolName}`);
    }

    if (event.type === "observation.created") {
      const findings = Array.isArray(event.data.findings)
        ? event.data.findings.map(String).join("; ")
        : "none";
      console.log(`  findings=${findings}`);
    }
  }
}
