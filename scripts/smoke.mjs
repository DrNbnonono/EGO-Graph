import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const egoHome = await mkdtemp(join(tmpdir(), "ego-smoke-"));

try {
  await execa("pnpm", ["build"], { stdio: "inherit" });

  const help = await execa("node", ["apps/ego-cli/dist/index.js", "--help"]);
  if (!help.stdout.includes("EGO-Graph")) {
    throw new Error("ego --help did not include EGO-Graph");
  }

  const doctor = await execa("node", ["apps/ego-cli/dist/index.js", "doctor"], {
    env: { EGO_HOME: egoHome },
  });
  if (!doctor.stdout.includes("Trajectory storage")) {
    throw new Error("ego doctor did not verify trajectory storage");
  }

  const run = await execa(
    "node",
    [
      "apps/ego-cli/dist/index.js",
      "run",
      "--scenario",
      "web_pentest",
      "--input",
      "scenarios/web_pentest/basic/task.json",
      "--run-id",
      "smoke-run-001",
    ],
    { env: { EGO_HOME: egoHome } },
  );
  if (!run.stdout.includes("Fixture contains an exposed admin hint")) {
    throw new Error("ego run did not emit expected finding");
  }

  console.log("EGO-Graph smoke PASS");
} finally {
  await rm(egoHome, { recursive: true, force: true });
}
