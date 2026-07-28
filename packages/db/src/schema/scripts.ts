// The `scripts` table — agent self-extension.
//
// A script is a named, replayable Code Mode program: the stabilized rung above
// run_code. run_code discovers a working tool chain, write_script saves it,
// run_script replays it with no fresh reasoning.

import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** A declared argument of a script. Stored inside the `args` JSON column. */
export interface ScriptArg {
  name: string;
  description?: string;
  required?: boolean;
}

export const scripts = sqliteTable(
  "scripts",
  {
    /** "global" or "repo:<owner/repo>", with repo scope winning name clashes. */
    scope: text("scope").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** TypeScript body. Args arrive as the `args` object (args.<name>). */
    code: text("code").notNull(),
    // mode:"json" parses and serializes at the driver. The layer this replaced
    // called JSON.parse(r.args || "[]") by hand and handed back `any`.
    args: text("args", { mode: "json" }).notNull().$type<ScriptArg[]>().default([]),
    /**
     * Ticket statuses allowed to run this script; empty = any.
     *
     * Typed `string[]` rather than `TicketStatus[]` on purpose: membership is
     * enforced by `validateScript` at the registration boundary, and narrowing
     * here would make `Script` structurally incompatible with the API's
     * `ScriptRecord` — forcing a cast at every call site to buy a guarantee the
     * validator already provides.
     */
    statusGates: text("status_gates", { mode: "json" }).notNull().$type<string[]>().default([]),
    createdBy: text("created_by").notNull().$type<"agent" | "user" | "seed">(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.name] })],
);

export type Script = typeof scripts.$inferSelect;
export type NewScript = typeof scripts.$inferInsert;
