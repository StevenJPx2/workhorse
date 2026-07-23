// Control-JSON validation — ctx.stage checks a stage's control.json against
// its inline control schema (the completion contract).

import type { JsonSchema } from "./types";

/** Minimal JSON-schema check (type/required/enum/properties — the subset specs use). */
export function validateAgainstSchema(value: unknown, schema: JsonSchema, path = "$"): string[] {
  const errors: string[] = [];
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [`${path}: expected object`];
    }
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) errors.push(...validateAgainstSchema(obj[key], sub, `${path}.${key}`));
    }
    return errors;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (schema.items) {
      value.forEach((v, i) => errors.push(...validateAgainstSchema(v, schema.items!, `${path}[${i}]`)));
    }
    return errors;
  }
  if (schema.type && typeof value !== schema.type) {
    return [`${path}: expected ${schema.type}`];
  }
  if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
    return [`${path}: must be one of ${schema.enum.join(", ")}`];
  }
  return errors;
}
