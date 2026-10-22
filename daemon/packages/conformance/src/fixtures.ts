// The files, policy and app a daemon must be installed with for the conformance suite (and the
// smoke scripts) to run against it.
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_READ_BYTES } from "@workhorse/protocol";

export const NOTE = { path: "todo.md", text: "buy milk\n" } as const;

// Notes of exactly the read limit and one byte over it.
export const AT_LIMIT = "at-limit.md";
export const OVER_LIMIT = "over-limit.md";

export const SECRET = { file: "secrets.txt", text: "top secret\n" } as const;

// notes/escape.txt -> ../secrets.txt, and notes/escape-dir -> .. (so escape-dir/secrets.txt).
export const ESCAPE_FILE = "escape.txt";
export const ESCAPE_DIR = "escape-dir";

// The test app, as `workhorse install --app` expects it.
const NOTES_APP = join(import.meta.dirname, "..", "fixtures", "notes");

export type Fixtures = { readonly policy: string; readonly notes: string; readonly app: string };

// Writes the notes folder, a secret beside it (outside the root), and the policy that grants
// the app read access to the notes folder only.
export function writeFixtures(dir: string): Fixtures {
  const notes = join(dir, "notes");
  mkdirSync(notes, { recursive: true });
  writeFileSync(join(notes, NOTE.path), NOTE.text);
  writeFileSync(join(notes, AT_LIMIT), "x".repeat(MAX_READ_BYTES));
  writeFileSync(join(notes, OVER_LIMIT), "x".repeat(MAX_READ_BYTES + 1));
  writeFileSync(join(dir, SECRET.file), SECRET.text);

  // Symlinks inside the root that point outside it. Only the OS sandbox stops them.
  for (const [link, target] of [
    [ESCAPE_FILE, join("..", SECRET.file)],
    [ESCAPE_DIR, ".."],
  ] as const) {
    rmSync(join(notes, link), { force: true });
    symlinkSync(target, join(notes, link));
  }

  const policy = join(dir, "policy.json");
  writeFileSync(
    policy,
    JSON.stringify({ apps: { notes: { fs: { roots: { notes }, mode: "read" } } } }, null, 2),
  );

  return { policy, notes, app: NOTES_APP };
}
