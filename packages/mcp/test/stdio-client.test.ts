import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpStdioClient } from "../src/index.js";

describe("MCP stdio client", () => {
  it("lists and calls tools over stdio JSON-RPC frames", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-mcp-stdio-"));
    const serverPath = join(dir, "server.mjs");
    await writeFile(
      serverPath,
      `
let buffer = "";
function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body);
}
function handle(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "0.1.0" } } });
  } else if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] } });
  } else if (message.method === "tools/call") {
    send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: message.params.arguments.text }] } });
  }
}
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  while (true) {
    const separator = buffer.indexOf("\\r\\n\\r\\n");
    if (separator < 0) break;
    const header = buffer.slice(0, separator);
    const match = /Content-Length: (\\d+)/i.exec(header);
    const length = Number(match?.[1] ?? 0);
    if (buffer.length < separator + 4 + length) break;
    const body = buffer.slice(separator + 4, separator + 4 + length);
    buffer = buffer.slice(separator + 4 + length);
    handle(JSON.parse(body));
  }
});
`,
      "utf8",
    );

    const client = createMcpStdioClient({
      name: "fixture",
      transport: "stdio",
      command: process.execPath,
      args: [serverPath],
      enabled: true,
    });

    try {
      const tools = await client.listTools();
      const result = await client.callTool("echo", { text: "hello" });

      expect(tools.map((tool) => tool.name)).toEqual(["echo"]);
      expect(result.content[0]?.text).toBe("hello");
    } finally {
      await client.close();
    }
  });

  it("parses Content-Length frames by bytes for non-ASCII tool responses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-mcp-stdio-unicode-"));
    const serverPath = join(dir, "server.mjs");
    await writeFile(
      serverPath,
      `
let buffer = Buffer.alloc(0);
function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(Buffer.concat([
    Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n"),
    body,
  ]));
}
function handle(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "0.1.0" } } });
  } else if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "echo", description: "回显工具", inputSchema: { type: "object" } }] } });
  } else if (message.method === "tools/call") {
    send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "紫莲花：" + message.params.arguments.text }] } });
  }
}
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const separator = buffer.indexOf(Buffer.from("\\r\\n\\r\\n"));
    if (separator < 0) break;
    const header = buffer.subarray(0, separator).toString("utf8");
    const match = /Content-Length: (\\d+)/i.exec(header);
    const length = Number(match?.[1] ?? 0);
    const bodyStart = separator + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
    buffer = buffer.subarray(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`,
      "utf8",
    );

    const client = createMcpStdioClient({
      name: "fixture",
      transport: "stdio",
      command: process.execPath,
      args: [serverPath],
      enabled: true,
    });

    try {
      const tools = await client.listTools();
      const result = await client.callTool("echo", { text: "MiniMax" });

      expect(tools[0]?.description).toBe("回显工具");
      expect(result.content[0]?.text).toBe("紫莲花：MiniMax");
    } finally {
      await client.close();
    }
  });
});
