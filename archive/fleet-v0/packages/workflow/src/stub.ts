// Synthesize a placeholder value from a valibot schema.
//
// Discovery runs a workflow's run() without a model, so every ctx.run() must hand
// back something shaped like real output — otherwise `if (r.control.uiChanges)`
// throws on undefined and the graph walk dies at the first branch.
//
// This reads valibot's internal shape (`type`, `entries`, `options`, `wrapped`,
// `item`), which is public-by-convention rather than a documented API. A schema
// kind we don't recognize yields null rather than throwing: an unknown field
// should not make a workflow undiscoverable.

/** Minimal structural view of a valibot schema. */
interface SchemaLike {
  type?: string;
  entries?: Record<string, SchemaLike>;
  options?: unknown[];
  literal?: unknown;
  wrapped?: SchemaLike;
  item?: SchemaLike;
  default?: unknown;
}

/**
 * Which value a scalar gets. Discovery walks the graph once per polarity and
 * unions the results, so a boolean branch exposes BOTH arms instead of whichever
 * one a single fixed stub happened to select.
 */
export type StubPolarity = "low" | "high";

/**
 * One array element under "high" — enough for `arr.length` to be truthy and
 * `arr[0]` to resolve, which is all a loop body needs to be entered.
 */
const HIGH_ARRAY_LENGTH = 1;

function stubScalar(type: string, polarity: StubPolarity): unknown {
  switch (type) {
    case "string":
      return polarity === "high" ? "stub" : "";
    case "number":
    case "bigint":
      return polarity === "high" ? 1 : 0;
    case "boolean":
      return polarity === "high";
    case "date":
      return new Date(0);
    default:
      return null;
  }
}

/**
 * Handlers by schema family. A table rather than one wide switch: valibot has many
 * schema kinds, and a single function covering them all is the shape that trips
 * the complexity gate while hiding which kinds are actually supported.
 *
 * Each handler receives the recursive stub function, so families that wrap other
 * schemas (optional, array, union) do not need a module-level cycle.
 */
type Handler = (s: SchemaLike, polarity: StubPolarity, recurse: typeof stubFromSchema) => unknown;

const OBJECT_KINDS = ["object", "loose_object", "strict_object"];
const OPTIONAL_KINDS = ["optional", "nullable", "nullish", "undefinedable"];
const CHOICE_KINDS = ["picklist", "enum"];
const UNION_KINDS = ["union", "variant"];

/** Under "high", take the LAST option; under "low", the first. */
function pickEnd<T>(options: T[], polarity: StubPolarity): T | null {
  if (!options.length) return null;
  return polarity === "high" ? options[options.length - 1] : options[0];
}

const HANDLERS: Array<{ kinds: string[]; handle: Handler }> = [
  {
    kinds: OBJECT_KINDS,
    handle: (s, polarity, recurse) => {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(s.entries ?? {})) out[key] = recurse(entry, polarity);
      return out;
    },
  },
  {
    kinds: ["array"],
    // Empty under "low" so a `for (const x of xs)` body is skipped; populated
    // under "high" so it is entered. Both are real workflow paths.
    handle: (s, polarity, recurse) =>
      polarity === "high" && s.item ? Array.from({ length: HIGH_ARRAY_LENGTH }, () => recurse(s.item, polarity)) : [],
  },
  {
    kinds: CHOICE_KINDS,
    // Opposite ends, so a two-option verdict exposes both routes.
    handle: (s, polarity) => pickEnd(s.options ?? [], polarity),
  },
  {
    kinds: ["literal"],
    handle: (s) => s.literal ?? null,
  },
  {
    kinds: OPTIONAL_KINDS,
    // Present under "high", absent under "low" — an optional field guards a
    // branch as often as a boolean does.
    handle: (s, polarity, recurse) => (polarity === "high" && s.wrapped ? recurse(s.wrapped, polarity) : undefined),
  },
  {
    kinds: UNION_KINDS,
    handle: (s, polarity, recurse) => {
      const chosen = pickEnd((s.options ?? []) as SchemaLike[], polarity);
      return chosen ? recurse(chosen, polarity) : null;
    },
  },
  {
    kinds: ["record"],
    handle: () => ({}),
  },
];

/** kind → handler, built once. */
const BY_KIND = new Map<string, Handler>(HANDLERS.flatMap(({ kinds, handle }) => kinds.map((k) => [k, handle])));

/**
 * A placeholder matching `schema`'s shape.
 *
 * `polarity` decides scalar values: "low" produces falsy/empty, "high" produces
 * truthy/non-empty. Neither is "correct" — the pair is what makes both sides of a
 * conditional reachable.
 */
export function stubFromSchema(schema: unknown, polarity: StubPolarity = "low"): unknown {
  const s = schema as SchemaLike | undefined;
  if (!s || typeof s !== "object") return null;

  // An explicit default is better than anything we could invent.
  if (s.default !== undefined) return typeof s.default === "function" ? (s.default as () => unknown)() : s.default;

  const handler = BY_KIND.get(s.type ?? "");
  return handler ? handler(s, polarity, stubFromSchema) : stubScalar(s.type ?? "", polarity);
}

/** Both polarities, in the order discovery should walk them. */
export const POLARITIES: StubPolarity[] = ["low", "high"];

