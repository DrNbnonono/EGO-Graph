import {readFile} from "node:fs/promises";
import {handleRunCommand} from "./run.js";

type EvalCase = {
  id: string;
  scenario: "web_pentest";
  taskFile: string;
  expectedFinding: string;
};

export async function handleEvalCommand(options: {dataset: string}): Promise<void> {
  const raw = await readFile(options.dataset, "utf8");
  const cases = raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvalCase);

  for (const testCase of cases) {
    const chunks: string[] = [];
    const originalLog = console.log;
    console.log = (...messages: unknown[]) => {
      chunks.push(messages.map(String).join(" "));
    };
    try {
      await handleRunCommand({
        scenario: testCase.scenario,
        input: testCase.taskFile,
        runId: testCase.id,
      });
    } finally {
      console.log = originalLog;
    }

    const output = chunks.join("\n");
    const status = output.includes(testCase.expectedFinding) ? "PASS" : "FAIL";
    console.log(`${testCase.id} ${status}`);
  }
}
