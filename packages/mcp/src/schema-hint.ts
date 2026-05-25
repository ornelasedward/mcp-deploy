import { z } from "zod";

/** Lightweight Zod → JSON-schema-ish hint for MCP cards (no extra deps). */
export function zodInputHint(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(schema.shape)) {
      props[key] = zodFieldHint(field as z.ZodTypeAny);
      if (!(field as z.ZodTypeAny).safeParse(undefined).success) {
        required.push(key);
      }
    }
    return { type: "object", properties: props, required };
  }
  return { type: zodFieldHint(schema) };
}

function zodFieldHint(field: z.ZodTypeAny): unknown {
  if (field instanceof z.ZodString) return { type: "string" };
  if (field instanceof z.ZodNumber) return { type: "number" };
  if (field instanceof z.ZodBoolean) return { type: "boolean" };
  if (field instanceof z.ZodEnum) return { type: "string", enum: field.options };
  if (field instanceof z.ZodOptional) return zodFieldHint(field.unwrap() as z.ZodTypeAny);
  if (field instanceof z.ZodDefault) return zodFieldHint(field.removeDefault() as z.ZodTypeAny);
  return { type: "unknown" };
}

export function exampleInputFromSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) return { input: {} };
  const ex: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const f = field as z.ZodTypeAny;
    if (f instanceof z.ZodString) ex[key] = key === "message" ? "Hello from Claude" : "example";
    else if (f instanceof z.ZodEnum) ex[key] = f.options[0];
    else if (f instanceof z.ZodNumber) ex[key] = 1;
    else if (f instanceof z.ZodBoolean) ex[key] = true;
    else ex[key] = null;
  }
  return ex;
}
