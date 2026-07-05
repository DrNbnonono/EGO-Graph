import { z } from "zod";
import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "../src/schema.js";

describe("zodToJsonSchema", () => {
  it("converts a flat object with required and optional fields", () => {
    const schema = z.object({
      path: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
      flag: z.boolean(),
    });
    const json = zodToJsonSchema(schema) as {
      properties: {
        path: { type?: string };
        limit: { type?: string; minimum?: number; maximum?: number };
        flag: { type?: string };
      };
      required: unknown[];
    };
    expect(json.properties.path.type).toBe("string");
    // int constraint overrides the default "number" type label.
    expect(json.properties.limit.type).toBe("integer");
    expect(json.properties.limit.minimum).toBe(1);
    expect(json.properties.limit.maximum).toBe(100);
    expect(json.properties.flag.type).toBe("boolean");
    expect(json.required).toEqual(["path", "flag"]);
  });

  it("converts enum and array of strings", () => {
    const schema = z.object({
      kind: z.enum(["info", "low", "high"]),
      tags: z.array(z.string()),
    });
    const json = zodToJsonSchema(schema) as {
      properties: { kind: { enum?: unknown }; tags: { type?: string } };
    };
    expect(json.properties.kind.enum).toEqual(["info", "low", "high"]);
    expect(json.properties.tags.type).toBe("array");
  });

  it("converts nested objects", () => {
    const schema = z.object({
      outer: z.object({
        inner: z.string(),
        number: z.number(),
      }),
    });
    const json = zodToJsonSchema(schema) as {
      properties: {
        outer: {
          type?: string;
          properties?: { inner?: { type?: string }; number?: { type?: string } };
          required?: unknown[];
        };
      };
    };
    expect(json.properties.outer.type).toBe("object");
    expect(json.properties.outer.properties?.inner?.type).toBe("string");
    expect(json.properties.outer.properties?.number?.type).toBe("number");
    expect(json.properties.outer.required).toEqual(["inner", "number"]);
  });

  it("converts unions and records", () => {
    const schema = z.object({
      either: z.union([z.string(), z.number()]),
      meta: z.record(z.string()),
    });
    const json = zodToJsonSchema(schema) as {
      properties: {
        either: { anyOf?: unknown[] };
        meta: { type?: string; additionalProperties?: unknown };
      };
    };
    expect(json.properties.either.anyOf).toHaveLength(2);
    expect(json.properties.meta.type).toBe("object");
    expect(json.properties.meta.additionalProperties).toEqual({ type: "string" });
  });

  it("converts discriminated unions", () => {
    const schema = z.discriminatedUnion("type", [
      z.object({ type: z.literal("create_file"), path: z.string(), content: z.string() }),
      z.object({ type: z.literal("delete_file"), path: z.string() }),
    ]);
    const json = zodToJsonSchema(schema) as { anyOf?: Array<{ properties?: unknown }> };
    expect(json.anyOf).toHaveLength(2);
  });

  it("handles default and nullable wrappers", () => {
    const schema = z.object({
      count: z.number().default(10),
      maybeName: z.string().nullable(),
    });
    const json = zodToJsonSchema(schema) as {
      properties: { count: { type?: string }; maybeName: { type?: string } };
      required: unknown[];
    };
    expect(json.properties.count.type).toBe("number");
    expect(json.properties.maybeName.type).toBe("string");
    // default + nullable are optional for our purposes.
    expect(json.required).toEqual([]);
  });

  it("does not crash on recursive schemas", () => {
    type Node = { value: number; next?: Node };
    const schema: z.ZodType<Node> = z.lazy(() =>
      z.object({
        value: z.number(),
        next: schema.optional(),
      }),
    );
    expect(() => zodToJsonSchema(schema)).not.toThrow();
  });

  it("handles unknown zod variants with a permissive fallback", () => {
    const schema = z.unknown();
    const json = zodToJsonSchema(schema);
    // Unknown type maps to an empty schema (permissive).
    expect(json).toEqual({});
  });
});
