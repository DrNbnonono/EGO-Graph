export async function handleServeCommand(): Promise<void> {
  const { serve } = await import("@hono/node-server");
  const { createServer } = await import("@ego-graph/ego-api");
  const port = Number(process.env.EGO_PORT ?? 4317);

  const server = serve({ fetch: createServer().fetch, port });
  console.log(`EGO-Graph 可视化驾驶舱：http://127.0.0.1:${port}`);
  console.log(`EGO-Graph API listening on http://127.0.0.1:${port}`);

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise<void>(() => {});
}
