import type { ZodTypeAny } from "zod";
import type { ToolDefinition } from "./tool-definition.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<ZodTypeAny, ZodTypeAny>>();

  register(tool: ToolDefinition<ZodTypeAny, ZodTypeAny>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition<ZodTypeAny, ZodTypeAny> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    return tool;
  }

  list(): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
