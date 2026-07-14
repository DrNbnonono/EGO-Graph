import { access, mkdir } from "node:fs/promises";
import { hasLegacyPlaintextModelSecret, isModelConfigured, loadModelConfigWithSource } from "@ego-graph/llm";
import { sqlitePath, trajectoryDir } from "@ego-graph/storage";
import { detectSecurityCapabilities } from "@ego-graph/tools";
import { resolveWorkspaceEgoHome, resolveWorkspaceRoot } from "../workspace-root.js";

export async function handleDoctorCommand(options: { tools?: boolean } = {}): Promise<void> {
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
    hasLegacyPlaintextModelSecret(workspaceRoot)
      ? "SECURITY WARNING: plaintext model API key found; migrate to apiKeyEnv and remove the secret."
      : "Model secret storage no plaintext key detected",
  );
  console.log(
    `Model config source ${loadedModelConfig.source}${
      loadedModelConfig.path ? ` (${loadedModelConfig.path})` : ""
    }`,
  );
  if (options.tools) {
    const capabilities = await detectSecurityCapabilities();
    console.log("Security tool runtimes");
    for (const capability of capabilities) {
      const version = capability.version ? ` ${capability.version}` : "";
      const binary = capability.binaryPath ? ` (${capability.binaryPath})` : "";
      console.log(
        `- ${capability.name}: ${capability.status}/${capability.source}${version}${binary}`,
      );
    }
    const verified = capabilities.filter((capability) => capability.status === "verified").length;
    const ready = capabilities.filter((capability) => capability.status === "ready").length;
    const degraded = capabilities.filter((capability) => capability.status === "degraded").length;
    const unavailable = capabilities.filter(
      (capability) => capability.status === "unavailable" || capability.status === "failed",
    ).length;
    console.log(
      `Tool truth: ${verified} verified, ${ready} ready, ${degraded} degraded, ${unavailable} unavailable/failed`,
    );
  }
  console.log("EGO-Graph doctor complete");
}
