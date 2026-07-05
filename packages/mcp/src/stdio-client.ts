import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerDescriptor } from "./mcp-manifest.js";

export type McpToolInfo = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
    [key: string]: unknown;
  };
};

export type McpCallToolResult = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export type McpClient = {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<McpCallToolResult>;
  close(): Promise<void>;
};

export type McpStdioClient = McpClient;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id?: number;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
};

export function createMcpStdioClient(server: McpServerDescriptor): McpStdioClient {
  let processRef: ChildProcessWithoutNullStreams | undefined;
  let connected = false;
  let nextId = 1;
  let stdoutBuffer = Buffer.alloc(0);
  const pending = new Map<number, PendingRequest>();

  async function ensureConnected(): Promise<void> {
    if (connected) {
      return;
    }
    if (!server.command) {
      throw new Error(`MCP stdio server ${server.name} is missing command`);
    }
    processRef = spawn(server.command, server.args ?? [], {
      cwd: process.cwd(),
      env: { ...process.env, ...(server.env ?? {}) },
      stdio: "pipe",
      windowsHide: true,
    });
    processRef.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
      drainMessages();
    });
    processRef.stderr.on("data", () => {
      // MCP servers may log to stderr; stderr alone is not a protocol failure.
    });
    processRef.on("error", (error) => {
      rejectAll(error instanceof Error ? error : new Error(String(error)));
    });
    processRef.on("exit", (code) => {
      connected = false;
      if (pending.size > 0) {
        rejectAll(new Error(`MCP server ${server.name} exited with code ${code ?? "unknown"}`));
      }
    });

    await request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "EGO-Graph", version: "0.1.0" },
    });
    connected = true;
  }

  async function request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!processRef) {
      throw new Error("MCP stdio process is not started");
    }
    const id = nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    };
    const body = JSON.stringify(message);

    const result = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, 10_000);
      pending.set(id, { resolve, reject, timeout });
    });

    processRef.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
    return result;
  }

  function drainMessages(): void {
    while (stdoutBuffer.length > 0) {
      if (startsWithContentLength(stdoutBuffer)) {
        const framed = tryReadContentLengthFrame();
        if (!framed) {
          return;
        }
        handleResponse(framed);
        continue;
      }

      const lineBreak = stdoutBuffer.indexOf(0x0a);
      if (lineBreak < 0) {
        return;
      }
      const line = stdoutBuffer.subarray(0, lineBreak).toString("utf8").trim();
      stdoutBuffer = stdoutBuffer.subarray(lineBreak + 1);
      if (line) {
        handleResponse(JSON.parse(line) as JsonRpcResponse);
      }
    }
  }

  function tryReadContentLengthFrame(): JsonRpcResponse | undefined {
    const separator = stdoutBuffer.indexOf(Buffer.from("\r\n\r\n"));
    if (separator < 0) {
      return undefined;
    }
    const header = stdoutBuffer.subarray(0, separator).toString("utf8");
    const match = /content-length:\s*(\d+)/i.exec(header);
    const length = Number(match?.[1] ?? 0);
    const bodyStart = separator + 4;
    if (stdoutBuffer.length < bodyStart + length) {
      return undefined;
    }
    const body = stdoutBuffer.subarray(bodyStart, bodyStart + length).toString("utf8");
    stdoutBuffer = stdoutBuffer.subarray(bodyStart + length);
    return JSON.parse(body) as JsonRpcResponse;
  }

  function startsWithContentLength(buffer: Buffer): boolean {
    return (
      buffer.subarray(0, "content-length:".length).toString("utf8").toLowerCase() ===
      "content-length:"
    );
  }

  function handleResponse(response: JsonRpcResponse): void {
    if (typeof response.id !== "number") {
      return;
    }
    const waiter = pending.get(response.id);
    if (!waiter) {
      return;
    }
    pending.delete(response.id);
    clearTimeout(waiter.timeout);
    if (response.error) {
      waiter.reject(new Error(response.error.message ?? `MCP error ${response.error.code ?? ""}`));
    } else {
      waiter.resolve(response.result);
    }
  }

  function rejectAll(error: Error): void {
    for (const [id, waiter] of pending) {
      pending.delete(id);
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  return {
    async listTools() {
      await ensureConnected();
      const result = (await request("tools/list")) as { tools?: McpToolInfo[] };
      return result.tools ?? [];
    },
    async callTool(name, args = {}) {
      await ensureConnected();
      return (await request("tools/call", { name, arguments: args })) as McpCallToolResult;
    },
    async close() {
      rejectAll(new Error("MCP client closed"));
      if (!processRef) {
        return;
      }
      processRef.kill();
      processRef = undefined;
      connected = false;
    },
  };
}
