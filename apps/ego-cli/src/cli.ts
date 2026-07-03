import { Command } from "commander";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ego")
    .description("EGO-Graph cybersecurity agent")
    .version("0.1.0")
    .action(async () => {
      const { handleTuiCommand } = await import("./commands/tui.js");
      await handleTuiCommand();
    });

  program
    .command("run")
    .description("Run an EGO-Graph mission")
    .option("--scenario <name>", "scenario overlay name", "web_pentest")
    .option("--task <text>", "natural-language task")
    .option("--input <path>", "path to a task input file")
    .option("--run-id <id>", "stable run id for tests and replay")
    .action(async (options) => {
      const { handleRunCommand } = await import("./commands/run.js");
      await handleRunCommand(options);
    });

  program
    .command("replay")
    .description("Replay a recorded trajectory")
    .requiredOption("--trajectory-id <trajectoryId>", "trajectory id")
    .action(async (options) => {
      const { handleReplayCommand } = await import("./commands/replay.js");
      await handleReplayCommand(options);
    });

  program
    .command("eval")
    .description("Run an evaluation dataset")
    .requiredOption("--dataset <path>", "JSONL evaluation dataset")
    .action(async (options) => {
      const { handleEvalCommand } = await import("./commands/eval.js");
      await handleEvalCommand(options);
    });

  program
    .command("doctor")
    .description("Check local EGO-Graph readiness")
    .action(async () => {
      const { handleDoctorCommand } = await import("./commands/doctor.js");
      await handleDoctorCommand();
    });

  program
    .command("serve")
    .description("Start the local EGO-Graph API")
    .action(async () => {
      const { handleServeCommand } = await import("./commands/serve.js");
      await handleServeCommand();
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
