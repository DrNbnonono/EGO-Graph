import { access, mkdir } from "node:fs/promises";
import { isModelConfigured, loadModelConfigWithSource } from "@ego-graph/llm";
import { defaultEgoHome, sqlitePath, trajectoryDir } from "@ego-graph/storage";

export async function handleDoctorCommand(): Promise<void> {
  const egoHome = defaultEgoHome();
  const trajectories = trajectoryDir(egoHome);
  const loadedModelConfig = loadModelConfigWithSource({ workspaceRoot: process.cwd() });
  const modelConfig = loadedModelConfig.config;
  await mkdir(trajectories, { recursive: true });
  await access(trajectories);

  console.log(`Node.js ${process.version}`);
  console.log(`EGO_HOME ${egoHome}`);
  console.log(`Trajectory storage ${trajectories}`);
  console.log(`SQLite index ${sqlitePath(egoHome)}`);
  console.log(
    `Model provider ${modelConfig.provider} ${
      isModelConfigured(modelConfig) ? "configured" : "using deterministic fallback"
    }`,
  );
  console.log(
    `Model config source ${loadedModelConfig.source}${
      loadedModelConfig.path ? ` (${loadedModelConfig.path})` : ""
    }`,
  );
  console.log("EGO-Graph doctor complete");
}
