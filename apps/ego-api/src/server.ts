import {Hono} from "hono";

export function createServer(): Hono {
  const app = new Hono();

  app.get("/health", (context) => {
    return context.json({ok: true, service: "ego-api"});
  });

  return app;
}
