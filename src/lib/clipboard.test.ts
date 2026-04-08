/**
 * Tests for clipboard utility
 */

import { describe, expect, it, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { readClipboard, readClipboardSync } from "./clipboard.ts";

describe("clipboard", () => {
  describe("readClipboardSync", () => {
    let originalPlatform: PropertyDescriptor | undefined;
    let spawnSyncSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
      spawnSyncSpy = spyOn(Bun, "spawnSync");
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
      spawnSyncSpy.mockRestore();
    });

    it("returns clipboard contents on macOS", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      spawnSyncSpy.mockReturnValue({
        exitCode: 0,
        stdout: Buffer.from("pasted text\n"),
        stderr: Buffer.from(""),
      } as ReturnType<typeof Bun.spawnSync>);

      const result = readClipboardSync();

      expect(result).toBe("pasted text");
      expect(spawnSyncSpy).toHaveBeenCalledWith(["pbpaste"], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });
    });

    it("returns clipboard contents on Linux", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      spawnSyncSpy.mockReturnValue({
        exitCode: 0,
        stdout: Buffer.from("linux clipboard\n"),
        stderr: Buffer.from(""),
      } as ReturnType<typeof Bun.spawnSync>);

      const result = readClipboardSync();

      expect(result).toBe("linux clipboard");
      expect(spawnSyncSpy).toHaveBeenCalledWith([
        "xclip",
        "-selection",
        "clipboard",
        "-o",
      ], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });
    });

    it("returns clipboard contents on Windows", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      spawnSyncSpy.mockReturnValue({
        exitCode: 0,
        stdout: Buffer.from("windows clipboard\r\n"),
        stderr: Buffer.from(""),
      } as ReturnType<typeof Bun.spawnSync>);

      const result = readClipboardSync();

      expect(result).toBe("windows clipboard");
      expect(spawnSyncSpy).toHaveBeenCalledWith([
        "powershell",
        "-command",
        "Get-Clipboard",
      ], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });
    });

    it("returns empty string on unsupported platform", () => {
      Object.defineProperty(process, "platform", { value: "freebsd" });

      const result = readClipboardSync();

      expect(result).toBe("");
      expect(spawnSyncSpy).not.toHaveBeenCalled();
    });

    it("returns empty string when command fails", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      spawnSyncSpy.mockReturnValue({
        exitCode: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from("error"),
      } as ReturnType<typeof Bun.spawnSync>);

      const result = readClipboardSync();

      expect(result).toBe("");
    });

    it("returns empty string when command throws", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      spawnSyncSpy.mockImplementation(() => {
        throw new Error("Command not found");
      });

      const result = readClipboardSync();

      expect(result).toBe("");
    });

    it("handles multiline clipboard content", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      spawnSyncSpy.mockReturnValue({
        exitCode: 0,
        stdout: Buffer.from("line 1\nline 2\nline 3\n"),
        stderr: Buffer.from(""),
      } as ReturnType<typeof Bun.spawnSync>);

      const result = readClipboardSync();

      expect(result).toBe("line 1\nline 2\nline 3");
    });

    it("handles empty clipboard", () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      spawnSyncSpy.mockReturnValue({
        exitCode: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      } as ReturnType<typeof Bun.spawnSync>);

      const result = readClipboardSync();

      expect(result).toBe("");
    });
  });

  describe("readClipboard", () => {
    it("returns clipboard contents asynchronously", async () => {
      // This test runs the actual command on the host system
      // We just verify it returns a string (may be empty if clipboard is empty)
      const result = await readClipboard();

      expect(typeof result).toBe("string");
    });
  });
});
