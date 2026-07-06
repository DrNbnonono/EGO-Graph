import { createServer as createHttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSecurityToolRegistry } from "../src/security-tool-bridge.js";

describe("security tool bridge", () => {
  let server: ReturnType<typeof createHttpServer>;
  let baseUrl: string;

  beforeAll(async () => {
    server = createHttpServer((request, response) => {
      response.setHeader("x-powered-by", "ego-fixture");
      if (request.url === "/") {
        response.setHeader("content-type", "text/html");
        response.end('<html><title>EGO Fixture</title><a href="/admin">admin</a></html>');
        return;
      }
      response.end("admin panel");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("executes local fixture request, crawl, fingerprint, and report draft tools", async () => {
    const registry = createSecurityToolRegistry();
    const request = await registry.get("local_fixture.http_request").execute(
      { value: baseUrl },
      { workspaceRoot: process.cwd() },
    );
    const crawl = await registry.get("local_fixture.crawl").execute(
      { value: baseUrl },
      { workspaceRoot: process.cwd() },
    );
    const fingerprint = await registry.get("local_fixture.fingerprint").execute(
      { value: baseUrl },
      { workspaceRoot: process.cwd() },
    );
    const report = await registry.get("report.vulnerability_draft").execute(
      { value: "Admin panel exposed at /admin\nImpact: unauthorized discovery" },
      { workspaceRoot: process.cwd() },
    );

    expect(request.result.status).toBe(200);
    expect(JSON.stringify(crawl.result)).toContain("/admin");
    expect(JSON.stringify(fingerprint.result)).toContain("ego-fixture");
    expect(report.findings[0]).toContain("Draft vulnerability report");
  });
});
