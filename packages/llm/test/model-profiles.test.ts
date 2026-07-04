import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deleteModelProfile,
  listModelProfiles,
  loadModelConfigWithSource,
  saveModelProfile,
  selectModelProfile,
} from "../src/index.js";

describe("model profiles", () => {
  it("keeps legacy model config compatible while exposing it as an active profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-model-profiles-legacy-"));
    await mkdir(join(root, ".ego"), { recursive: true });
    await writeFile(
      join(root, ".ego", "config.json"),
      JSON.stringify({
        model: {
          provider: "minimax",
          apiKey: "legacy-key",
          model: "MiniMax-M3",
        },
      }),
      "utf8",
    );

    const profiles = await listModelProfiles({ workspaceRoot: root, env: {} });
    const active = loadModelConfigWithSource({ workspaceRoot: root, env: {} });

    expect(profiles.activeProfile?.id).toBe("legacy-model");
    expect(profiles.activeProfile?.config.provider).toBe("minimax");
    expect(profiles.activeProfile?.config.apiKey).toBeUndefined();
    expect(profiles.activeProfile?.apiKeyConfigured).toBe(true);
    expect(active.config.provider).toBe("minimax");
    expect(active.config.apiKey).toBe("legacy-key");
  });

  it("creates, selects, and deletes model profiles without leaking API keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-model-profiles-crud-"));

    await saveModelProfile({
      workspaceRoot: root,
      profile: {
        id: "minimax-main",
        name: "MiniMax 主力模型",
        config: {
          provider: "minimax",
          apiKey: "mini-secret",
          model: "MiniMax-M3",
        },
      },
    });
    await saveModelProfile({
      workspaceRoot: root,
      profile: {
        id: "local-openai",
        name: "本地 OpenAI 兼容",
        config: {
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:8000/v1",
          apiKey: "local-secret",
          model: "qwen-coder",
        },
      },
    });
    await selectModelProfile({ workspaceRoot: root, id: "local-openai" });

    const profiles = await listModelProfiles({ workspaceRoot: root, env: {} });
    const active = loadModelConfigWithSource({ workspaceRoot: root, env: {} });
    const file = JSON.parse(await readFile(join(root, ".ego", "config.json"), "utf8")) as {
      modelProfiles: Array<{ id: string; config: { apiKey?: string } }>;
      activeModelProfileId: string;
    };

    expect(profiles.activeProfile?.id).toBe("local-openai");
    expect(
      profiles.profiles.find((profile) => profile.id === "local-openai")?.config.apiKey,
    ).toBeUndefined();
    expect(active.config.model).toBe("qwen-coder");
    expect(active.config.apiKey).toBe("local-secret");
    expect(file.activeModelProfileId).toBe("local-openai");

    await expect(deleteModelProfile({ workspaceRoot: root, id: "local-openai" })).rejects.toThrow(
      "active",
    );
    await deleteModelProfile({ workspaceRoot: root, id: "minimax-main" });
    const afterDelete = await listModelProfiles({ workspaceRoot: root, env: {} });
    expect(afterDelete.profiles.map((profile) => profile.id)).toEqual(["local-openai"]);
  });
});
