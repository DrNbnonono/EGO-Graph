import { access, mkdir } from "node:fs/promises";
import { isModelConfigured, loadModelConfigWithSource } from "@ego-graph/llm";
import { sqlitePath, trajectoryDir } from "@ego-graph/storage";
import { resolveWorkspaceEgoHome, resolveWorkspaceRoot } from "../workspace-root.js";

export async function handleDoctorCommand(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot();
  const egoHome = resolveWorkspaceEgoHome(workspaceRoot);
  const trajectories = trajectoryDir(egoHome);
  const loadedModelConfig = loadModelConfigWithSource({ workspaceRoot });
  const modelConfig = loadedModelConfig.config;
  await mkdir(trajectories, { recursive: true });
  await access(trajectories);

  console.log(`Node.js ${process.version}`);
  console.log(`Workspace root ${workspaceRoot}`);
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
