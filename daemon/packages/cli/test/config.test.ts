import { describe, expect, it } from "vite-plus/test";
import { COMPATIBILITY_DATE } from "@workhorse/protocol";
import { diskRoots, renderConfig } from "../src/config.ts";
import { layoutOf } from "../src/layout.ts";

const layout = layoutOf("/home/me/.workhorse");

describe("diskRoots", () => {
  it("gives each granted root its own disk directory, writable only for read-write grants", () => {
    expect(
      diskRoots({
        apps: {
          notes: {
            fs: { roots: { notes: "/home/me/notes", drafts: "/home/me/drafts" }, mode: "read" },
          },
          skills: { fs: { roots: { skills: "/home/me/skills" }, mode: "read-write" } },
          quiet: {},
        },
      }),
    ).toEqual([
      { binding: "fs:notes:notes", path: "/home/me/notes", writable: false },
      { binding: "fs:notes:drafts", path: "/home/me/drafts", writable: false },
      { binding: "fs:skills:skills", path: "/home/me/skills", writable: true },
    ]);
  });
});

describe("renderConfig", () => {
  const config = renderConfig(layout, [
    { binding: "fs:notes:notes", path: "/home/me/notes", writable: false },
  ]);

  it("serves raw connections on the daemon's Unix socket", () => {
    expect(config).toContain(
      'sockets = [(name = "main", address = "unix:/home/me/.workhorse/sock/daemon.sock", tcp = (), service = "daemon")]',
    );
  });

  it("binds each root's disk directory under the name the daemon looks up", () => {
    expect(config).toContain(
      '(name = "fs:notes:notes", disk = (path = "/home/me/notes", writable = false)),',
    );
    expect(config).toContain('(name = "fs:notes:notes", service = "fs:notes:notes"),');
  });

  it("embeds the bundle and deployment beside the config, with the shared compatibility date", () => {
    expect(config).toContain('esModule = embed "daemon.js"');
    expect(config).toContain('json = embed "deployment.json"');
    expect(config).toContain(`compatibilityDate = "${COMPATIBILITY_DATE}"`);
    expect(config).toContain('compatibilityFlags = ["experimental"]');
  });
});
