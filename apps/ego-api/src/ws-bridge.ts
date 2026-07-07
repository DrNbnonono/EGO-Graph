/**
 * WebSocket bridge for real-time event push.
 *
 * Connects the Hermes event bus to WebSocket clients so the web dashboard
 * receives live Agent run events without polling.
 *
 * Protocol:
 * - Server → Client: JSON-serialized AgentRunEvent
 * - Client → Server: { type: "submit", message: string }
 *   or { type: "ping" }
 *
 * Features:
 * - Heartbeat ping/pong every 30s
 * - Max 10 concurrent connections
 * - Graceful shutdown on server close
 */
import type { Server, IncomingMessage } from "node:http";
import type { Socket } from "node:net";

type WebSocketLike = {
  readonly readyState: number;
  readonly bufferedAmount: number;
  on(event: "message", listener: (data: Buffer | string) => void): void;
  on(event: "close" | "error", listener: () => void): void;
  send(data: string): void;
  ping(): void;
  close(): void;
};

type WebSocketServerLike = {
  handleUpgrade(
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
    callback: (client: WebSocketLike) => void,
  ): void;
  emit(event: "connection", client: WebSocketLike, request: IncomingMessage): void;
  on(event: "connection", listener: (client: WebSocketLike) => void): void;
  close(): void;
};

type WsModuleLike = {
  WebSocketServer: new (options: { noServer: boolean }) => WebSocketServerLike;
};

// ── Types ──────────────────────────────────────────────────────────────────

export type WsBridgeEvent = {
  type: string;
  runId?: string;
  sessionId?: string;
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type WsClientMessage =
  | { type: "submit"; message: string }
  | { type: "ping" };

export type WsBridgeOptions = {
  /** Maximum concurrent WebSocket connections. Default: 10. */
  maxConnections?: number;
  /** Heartbeat interval in ms. Default: 30000. */
  heartbeatMs?: number;
  /** Callback when a client submits a message. */
  onSubmit?: (message: string) => void;
  /** Callback for bridge lifecycle events. */
  onConnection?: (count: number) => void;
};

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Create a WebSocket bridge attached to an HTTP server.
 *
 * Uses dynamic import of `ws` to avoid hard dependency when the package
 * is not installed. Returns `undefined` if `ws` is unavailable.
 */
export async function createWebSocketBridge(
  server: Server,
  options?: WsBridgeOptions,
): Promise<WsBridge | undefined> {
  const maxConnections = options?.maxConnections ?? 10;
  const heartbeatMs = options?.heartbeatMs ?? 30_000;

  let ws: WsModuleLike;
  try {
    const importModule = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<unknown>;
    ws = (await importModule("ws")) as WsModuleLike;
  } catch {
    console.log("[ws-bridge] ws package not installed; WebSocket disabled.");
    return undefined;
  }

  const { WebSocketServer } = ws;
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocketLike>();

  // Handle upgrade requests.
  server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
    if (request.url !== "/ws/events") {
      socket.destroy();
      return;
    }
    if (clients.size >= maxConnections) {
      socket.write("HTTP/1.1 503 Too Many Connections\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (wsClient) => {
      wss.emit("connection", wsClient, request);
    });
  });

  // Handle new connections.
  wss.on("connection", (wsClient) => {
    clients.add(wsClient);
    options?.onConnection?.(clients.size);

    wsClient.on("message", (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString()) as WsClientMessage;
        if (msg.type === "submit" && options?.onSubmit) {
          options.onSubmit(msg.message);
        }
        if (msg.type === "ping") {
          wsClient.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    wsClient.on("close", () => {
      clients.delete(wsClient);
      options?.onConnection?.(clients.size);
    });

    wsClient.on("error", () => {
      clients.delete(wsClient);
      options?.onConnection?.(clients.size);
    });
  });

  // Heartbeat: ping all clients periodically to detect stale connections.
  const heartbeatTimer = setInterval(() => {
    for (const client of clients) {
      if (client.readyState !== 1 /* OPEN */) {
        clients.delete(client);
        continue;
      }
      try {
        client.ping();
      } catch {
        clients.delete(client);
      }
    }
  }, heartbeatMs);

  const bridge: WsBridge = {
    broadcast(event: WsBridgeEvent): void {
      const payload = JSON.stringify(event);
      for (const client of clients) {
        if (client.readyState === 1 /* OPEN */) {
          try {
            // Backpressure: skip if buffer is too large.
            if (client.bufferedAmount < 65_536) {
              client.send(payload);
            }
          } catch {
            // Ignore send errors on individual clients.
          }
        }
      }
    },
    get connectionCount(): number {
      return clients.size;
    },
    close(): void {
      clearInterval(heartbeatTimer);
      for (const client of clients) {
        try { client.close(); } catch { /* ignore */ }
      }
      clients.clear();
      wss.close();
    },
  };

  return bridge;
}

export type WsBridge = {
  broadcast(event: WsBridgeEvent): void;
  readonly connectionCount: number;
  close(): void;
};
