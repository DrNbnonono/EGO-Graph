export async function handleServeCommand(): Promise<void> {
  const { serve } = await import("@hono/node-server");
  const { createServer, ensureCapabilityToken } = await import("@ego-graph/ego-api");
  const { defaultEgoHome } = await import("@ego-graph/storage");
  const port = Number(process.env.EGO_PORT ?? 4317);
  const egoHome = defaultEgoHome();
  const capability = await ensureCapabilityToken(egoHome);

  const server = serve({
    fetch: createServer({ egoHome, authMode: "required", capabilityToken: capability.token }).fetch,
    hostname: "127.0.0.1",
    port,
  });
  const keepAlive = setInterval(() => {}, 2_147_483_647);
  console.log(`EGO-Graph 可视化驾驶舱：http://127.0.0.1:${port}`);
  console.log(`EGO-Graph API listening on http://127.0.0.1:${port}`);
  console.log(`API capability stored at ${capability.path}; the secret is not printed.`);

  const shutdown = () => {
    clearInterval(keepAlive);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise<void>(() => {});
}
