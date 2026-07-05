import type { ZodTypeAny } from "zod";

/**
 * Convert a Zod schema into a JSON Schema object suitable for LLM tool definitions.
 *
 * This is a self-contained walker (no external dependency) that covers the Zod
 * variants used across @ego-graph tool definitions: objects (incl. nested),
 * strings (with optional enum values via ZodEnum or literals), numbers,
 * booleans, arrays, enums, optional/default wrappers, records, unions,
 * nullable, and catch-all fallback for unknown variants.
 *
 * The previous `zodToJsonSchemaLite` in @ego-graph/agent-harness was incomplete
 * (dropped unions, records, nullable, nested objects beyond one level, and
 * could not represent ZodLiteral). This implementation supersedes it.
 */
export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  return convertZodType(schema, new Set());
}

function convertZodType(schema: ZodTypeAny, seen: Set<ZodTypeAny>): Record<string, unknown> {
  const def = schema._def as {
    typeName?: string;
    shape?: () => Record<string, ZodTypeAny>;
    innerType?: ZodTypeAny;
    type?: ZodTypeAny;
    getter?: () => ZodTypeAny;
    schema?: ZodTypeAny;
    types?: ZodTypeAny[];
    left?: ZodTypeAny;
    right?: ZodTypeAny;
    items?: ZodTypeAny[] | readonly ZodTypeAny[];
    options?: readonly ZodTypeAny[] | Map<unknown, ZodTypeAny>;
    values?: readonly unknown[];
    valueType?: ZodTypeAny;
    keyType?: ZodTypeAny;
    value?: unknown;
    message?: string;
    checks?: Array<{ kind?: string; type?: string; value?: unknown }>;
    description?: string;
  };

  const description = typeof def.description === "string" ? { description: def.description } : {};

  switch (def.typeName) {
    case "ZodObject": {
      if (seen.has(schema)) {
        // Avoid infinite recursion on recursive/cyclic object schemas.
        return { type: "object", additionalProperties: true, ...description };
      }
      const nextSeen = new Set(seen);
      nextSeen.add(schema);
      const shape =
        typeof def.shape === "function" ? (def.shape() as Record<string, ZodTypeAny>) : {};
      const properties = Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [key, convertZodType(value, nextSeen)]),
      );
      return {
        type: "object",
        properties,
        required: Object.entries(shape)
          .filter(([, value]) => !isOptionalZod(value))
          .map(([key]) => key),
        additionalProperties: false,
        ...description,
      };
    }
    case "ZodString": {
      const enumValues = readStringEnumChecks(def.checks);
      if (enumValues) {
        return { type: "string", enum: enumValues, ...description };
      }
      return { type: "string", ...description };
    }
    case "ZodNumber": {
      const constraints: Record<string, unknown> = {};
      for (const check of def.checks ?? []) {
        if (check.kind === "min" && typeof check.value === "number") {
          constraints.minimum = check.value;
        } else if (check.kind === "max" && typeof check.value === "number") {
          constraints.maximum = check.value;
        } else if (check.kind === "int") {
          constraints.type = "integer";
        }
      }
      return { type: "number", ...constraints, ...description };
    }
    case "ZodBoolean":
      return { type: "boolean", ...description };
    case "ZodArray":
      return {
        type: "array",
        ...(def.type ? { items: convertZodType(def.type, seen) } : {}),
        ...description,
      };
    case "ZodTuple":
      return {
        type: "array",
        ...(Array.isArray(def.items)
          ? { items: def.items.map((item: ZodTypeAny) => convertZodType(item, seen)) }
          : {}),
        ...description,
      };
    case "ZodEnum":
      return {
        type: "string",
        ...(Array.isArray(def.values)
          ? { enum: def.values.map(String) }
          : {}),
        ...description,
      };
    case "ZodLiteral":
      return { ...(def.value !== undefined ? { const: def.value } : {}), ...description };
    case "ZodNativeEnum": {
      const values = def.values as Record<string, string | number> | undefined;
      return {
        type: "string",
        ...(values ? { enum: Object.values(values).map(String) } : {}),
        ...description,
      };
    }
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable":
    case "ZodCatch":
    case "ZodReadonly":
    case "ZodBranded":
      return def.innerType ? convertZodType(def.innerType, seen) : { type: "object" };
    case "ZodLazy": {
      if (seen.has(schema)) {
        return { type: "object", additionalProperties: true, ...description };
      }
      const nextSeen = new Set(seen);
      nextSeen.add(schema);
      const inner = def.getter?.() ?? def.schema;
      return inner
        ? convertZodType(inner, nextSeen)
        : { type: "object", additionalProperties: true };
    }
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return {
        anyOf: readZodOptions(def).map((option) => convertZodType(option, seen)),
        ...description,
      };
    case "ZodIntersection":
      return {
        allOf:
          def.left && def.right
            ? [convertZodType(def.left, seen), convertZodType(def.right, seen)]
            : Array.isArray(def.types)
              ? def.types.map((option) => convertZodType(option, seen))
              : [],
        ...description,
      };
    case "ZodRecord":
      return {
        type: "object",
        ...(def.valueType ? { additionalProperties: convertZodType(def.valueType, seen) } : {}),
        ...description,
      };
    case "ZodMap":
      return {
        type: "object",
        ...(def.valueType ? { additionalProperties: convertZodType(def.valueType, seen) } : {}),
        ...description,
      };
    case "ZodUnknown":
    case "ZodAny":
      return {};
    case "ZodNull":
      return { type: "null", ...description };
    case "ZodUndefined":
    case "ZodVoid":
      return { not: {}, ...description };
    default:
      // Unknown Zod variant: be permissive instead of dropping the field.
      return { type: "object", additionalProperties: true, ...description };
  }
}

function readZodOptions(def: {
  options?: readonly ZodTypeAny[] | Map<unknown, ZodTypeAny>;
  types?: ZodTypeAny[];
}): ZodTypeAny[] {
  if (Array.isArray(def.options)) {
    return [...def.options];
  }
  if (def.options instanceof Map) {
    return [...def.options.values()];
  }
  if (Array.isArray(def.types)) {
    return [...def.types];
  }
  return [];
}

function isOptionalZod(schema: ZodTypeAny): boolean {
  const def = schema._def as { typeName?: string };
  return (
    def.typeName === "ZodOptional" ||
    def.typeName === "ZodDefault" ||
    def.typeName === "ZodNullable" ||
    def.typeName === "ZodCatch"
  );
}

function readStringEnumChecks(
  checks: Array<{ kind?: string; type?: string; value?: unknown }> | undefined,
): string[] | undefined {
  if (!checks) {
    return undefined;
  }
  const enumValues: string[] = [];
  for (const check of checks) {
    if (check.kind === "enum" && Array.isArray(check.value)) {
      for (const value of check.value) {
        if (typeof value === "string") {
          enumValues.push(value);
        }
      }
    }
  }
  return enumValues.length > 0 ? enumValues : undefined;
}
