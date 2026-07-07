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

  const config = program.command("config").description("Manage local EGO-Graph settings");

  config
    .command("model")
    .description("Show or persist local LLM settings in .ego/config.json")
    .option(
      "--provider <provider>",
      "model provider: openai-compatible, deepseek, minimax, disabled",
    )
    .option("--base-url <url>", "model API base URL")
    .option("--api-key <key>", "model API key stored in local .ego/config.json")
    .option("--model <name>", "model name")
    .option("--chat-path <path>", "chat endpoint path")
    .option("--wire-api <api>", "wire API: openai-chat-completions or anthropic-messages")
    .option("--max-tokens <n>", "default max tokens")
    .option("--timeout-ms <n>", "request timeout in milliseconds")
    .option("--headers <json>", "extra HTTP headers as JSON")
    .action(async (options) => {
      const { handleConfigModelCommand } = await import("./commands/config.js");
      await handleConfigModelCommand(options);
    });

  config
    .command("mcp")
    .description("Add or update a local MCP server in .ego/config.json")
    .requiredOption("--name <name>", "MCP server name")
    .option("--transport <transport>", "transport: stdio or http")
    .option("--command <command>", "stdio command")
    .option("--args <args>", "comma-separated stdio args")
    .option("--url <url>", "HTTP MCP endpoint URL")
    .option("--disabled", "save the server disabled")
    .action(async (options) => {
      const { handleConfigMcpCommand } = await import("./commands/config.js");
      await handleConfigMcpCommand(options);
    });

  config
    .command("skill")
    .description("Add or update a local skill registration in .ego/config.json")
    .requiredOption("--name <name>", "skill name")
    .requiredOption("--description <description>", "skill description")
    .option("--version <version>", "skill version", "0.1.0")
    .option("--capabilities <capabilities>", "comma-separated capability names")
    .option("--tools <tools>", "comma-separated tool names")
    .option("--permissions <permissions>", "comma-separated permission labels")
    .requiredOption("--entry <entry>", "skill entry, for example local:report-writer")
    .option("--disabled", "save the skill disabled")
    .action(async (options) => {
      const { handleConfigSkillCommand } = await import("./commands/config.js");
      await handleConfigSkillCommand(options);
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
