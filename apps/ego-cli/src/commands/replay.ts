import {JsonlTrajectoryStore, trajectoryDir} from "@ego-graph/storage";

export async function handleReplayCommand(options: {trajectoryId: string}): Promise<void> {
  const store = new JsonlTrajectoryStore(trajectoryDir());
  const events = await store.readRun(options.trajectoryId);

  for (const event of events) {
    console.log(`${event.timestamp} ${event.type} ${event.message}`);
  }
}
