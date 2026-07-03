import {describe, expect, it} from "vitest";
import {createServer} from "../src/server.js";

describe("ego api server", () => {
  it("responds to health checks", async () => {
    const app = createServer();
    const response = await app.request("/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ok: true, service: "ego-api"});
  });
});
