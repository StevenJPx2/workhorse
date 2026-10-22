import type { FsGrant } from "@workhorse/protocol";
import { describe, expect, it } from "vite-plus/test";
import { decideRead, MAX_PATH_LENGTH } from "../src/fs.ts";

const grant: FsGrant = { roots: { notes: "/home/me/notes" }, mode: "read" };

describe("decideRead", () => {
  it("allows a plain relative path inside a granted root", () => {
    expect(decideRead(grant, "notes", "todo.md")).toEqual({
      type: "allowed",
      root: "notes",
      segments: ["todo.md"],
    });
    expect(decideRead(grant, "notes", "a/b c/%2e%2e")).toEqual({
      type: "allowed",
      root: "notes",
      segments: ["a", "b c", "%2e%2e"],
    });
  });

  it("denies roots the app was not granted, including Object.prototype names", () => {
    for (const root of ["other", "constructor", "__proto__", "toString", ""]) {
      expect(decideRead(grant, root, "todo.md")).toEqual({ type: "denied", reason: "no_grant" });
    }

    expect(decideRead(undefined, "notes", "todo.md")).toEqual({
      type: "denied",
      reason: "no_grant",
    });
  });

  it("denies paths that leave the root", () => {
    for (const path of ["../secrets.txt", "a/../../x", "a/..", "..", "/etc/passwd", "/"]) {
      expect(decideRead(grant, "notes", path)).toEqual({ type: "denied", reason: "outside_root" });
    }
  });

  it("rejects paths that are not plain names", () => {
    for (const path of ["", ".", "./a", "a//b", "a/", "a\0b", "x".repeat(MAX_PATH_LENGTH + 1)]) {
      expect(decideRead(grant, "notes", path)).toEqual({ type: "invalid_path" });
    }

    expect(decideRead(grant, "notes", "x".repeat(MAX_PATH_LENGTH)).type).toBe("allowed");
  });
});
