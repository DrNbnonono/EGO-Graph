import {Command} from "commander";
import {handleDoctorCommand} from "./commands/doctor.js";
import {handleEvalCommand} from "./commands/eval.js";
import {handleReplayCommand} from "./commands/replay.js";
import {handleRunCommand} from "./commands/run.js";
import {handleServeCommand} from "./commands/serve.js";

export function createProgram(): Command {
  const program = new Command();

  program.name("ego").description("EGO-Graph cybersecurity agent").version("0.1.0");

  program
    .command("run")
    .description("Run an EGO-Graph mission")
    .option("--scenario <name>", "scenario overlay name", "web_pentest")
    .option("--task <text>", "natural-language task")
    .option("--input <path>", "path to a task input file")
    .option("--run-id <id>", "stable run id for tests and replay")
    .action(async (options) => {
      await handleRunCommand(options);
    });

  program
    .command("replay")
    .description("Replay a recorded trajectory")
    .requiredOption("--trajectory-id <trajectoryId>", "trajectory id")
    .action(async (options) => {
      await handleReplayCommand(options);
    });

  program
    .command("eval")
    .description("Run an evaluation dataset")
    .requiredOption("--dataset <path>", "JSONL evaluation dataset")
    .action(async (options) => {
      await handleEvalCommand(options);
    });

  program.command("doctor").description("Check local EGO-Graph readiness").action(async () => {
    await handleDoctorCommand();
  });

  program.command("serve").description("Start the local EGO-Graph API").action(async () => {
    await handleServeCommand();
  });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
