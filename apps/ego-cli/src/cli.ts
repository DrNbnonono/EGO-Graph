import {Command} from "commander";
import {handleRunCommand} from "./commands/run.js";

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
    .requiredOption("--trajectory-id <id>", "trajectory id")
    .action(() => {
      console.log("ego replay is not wired yet");
    });

  program
    .command("eval")
    .description("Run an evaluation dataset")
    .requiredOption("--dataset <path>", "JSONL evaluation dataset")
    .action(() => {
      console.log("ego eval is not wired yet");
    });

  program.command("doctor").description("Check local EGO-Graph readiness").action(() => {
    console.log("ego doctor is not wired yet");
  });

  program.command("serve").description("Start the local EGO-Graph API").action(() => {
    console.log("ego serve is not wired yet");
  });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
