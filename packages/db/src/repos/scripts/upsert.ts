import { type Script, scripts } from "#schema";
import type { Conn } from "#repos/bind";

/**
 * Register or rewrite a script.
 *
 * createdAt/createdBy are deliberately NOT in the update set — provenance (who
 * first created it, and when) survives a rewrite.
 */
export async function upsert(d: Conn, s: Script): Promise<void> {
  await d
    .insert(scripts)
    .values(s)
    .onConflictDoUpdate({
      target: [scripts.scope, scripts.name],
      set: {
        description: s.description,
        code: s.code,
        args: s.args,
        statusGates: s.statusGates,
        updatedAt: s.updatedAt,
      },
    });
}
