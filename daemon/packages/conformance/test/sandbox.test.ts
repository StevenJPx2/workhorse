import { describe, expect, it } from "@effect/vitest";
import { ErrorCode } from "@workhorse/protocol";
import { Effect } from "effect";
import { ESCAPE_DIR, ESCAPE_FILE, SECRET } from "../src/fixtures.ts";
import { ready, request } from "./daemon.ts";

// workerd's disk directories follow symlinks, and core cannot see them: only the OS sandbox
// keeps these reads inside the root. A daemon without one fails this file.
describe("the OS sandbox", () => {
  it.live("stops a symlink in the root that points to a file outside it", () =>
    Effect.gen(function* () {
      const client = yield* ready;
      const response = yield* request(client, "notes.read", { path: ESCAPE_FILE });
      expect(JSON.stringify(response)).not.toContain(SECRET.text.trim());
      expect(response).toMatchObject({ error: { code: ErrorCode.failed } });
    }),
  );

  it.live("stops a symlinked folder that leads outside the root", () =>
    Effect.gen(function* () {
      const client = yield* ready;

      const response = yield* request(client, "notes.read", {
        path: `${ESCAPE_DIR}/${SECRET.file}`,
      });

      expect(JSON.stringify(response)).not.toContain(SECRET.text.trim());
      expect(response).toMatchObject({ error: { code: ErrorCode.failed } });
    }),
  );
});
