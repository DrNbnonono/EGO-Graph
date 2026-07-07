import { describe, expect, it } from "vitest";
import {
  detectDocker,
  resetDockerCache,
  executeInDocker,
} from "../src/security/sandbox/docker-executor.js";

describe("docker-executor module", () => {
  it("exports detectDocker function", () => {
    expect(typeof detectDocker).toBe("function");
  });

  it("exports executeInDocker function", () => {
    expect(typeof executeInDocker).toBe("function");
  });

  it("exports resetDockerCache function", () => {
    expect(typeof resetDockerCache).toBe("function");
  });

  it("detectDocker returns a structured result", async () => {
    resetDockerCache();
    const result = await detectDocker();
    expect(typeof result.available).toBe("boolean");
    if (result.available) {
      expect(typeof result.version).toBe("string");
    }
  });

  it("executeInDocker fails gracefully when Docker is unavailable", async () => {
    resetDockerCache();
    const availability = await detectDocker();
    if (!availability.available) {
      const result = await executeInDocker("echo", ["hello"], {
        workspaceRoot: "/tmp",
      });
      expect(result.sandboxed).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.stderr).toContain("Docker not available");
    }
  });
});
