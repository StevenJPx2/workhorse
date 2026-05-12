/**
 * Tests for Jira auth module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCredentials, saveCredentials, createCredentialGetter } from "../auth.ts";
import * as keychain from "@jiratown/core";

vi.mock("@jiratown/core", () => ({
  getCredential: vi.fn(),
  storeCredential: vi.fn(),
  deleteCredential: vi.fn(),
  // Re-export other things that might be needed
  PluginSymbol: Symbol.for("jiratown.plugin"),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadCredentials", () => {
  it("returns null when no credentials stored", async () => {
    vi.mocked(keychain.getCredential).mockResolvedValue(null);

    const creds = await loadCredentials();
    expect(creds).toBeNull();
  });

  it("returns credentials when stored", async () => {
    vi.mocked(keychain.getCredential)
      .mockResolvedValueOnce("access-token-123")
      .mockResolvedValueOnce("refresh-token-456")
      .mockResolvedValueOnce("2025-12-31T23:59:59Z");

    const creds = await loadCredentials();
    expect(creds).toEqual({
      accessToken: "access-token-123",
      refreshToken: "refresh-token-456",
      expiresAt: new Date("2025-12-31T23:59:59Z"),
    });
  });
});

describe("saveCredentials", () => {
  it("stores all credential fields", async () => {
    vi.mocked(keychain.storeCredential).mockResolvedValue(undefined);

    await saveCredentials({
      accessToken: "token123",
      refreshToken: "refresh456",
      expiresAt: new Date("2025-12-31T23:59:59Z"),
    });

    expect(keychain.storeCredential).toHaveBeenCalledWith("jira", "access_token", "token123");
    expect(keychain.storeCredential).toHaveBeenCalledWith("jira", "refresh_token", "refresh456");
    expect(keychain.storeCredential).toHaveBeenCalledWith(
      "jira",
      "expires_at",
      "2025-12-31T23:59:59.000Z",
    );
  });
});

describe("createCredentialGetter", () => {
  it("returns credentials when available", async () => {
    vi.mocked(keychain.getCredential)
      .mockResolvedValueOnce("token123")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const getter = createCredentialGetter();
    const creds = await getter();

    expect(creds.accessToken).toBe("token123");
  });

  it("throws when credentials missing", async () => {
    vi.mocked(keychain.getCredential).mockResolvedValue(null);

    const getter = createCredentialGetter();
    await expect(getter()).rejects.toThrow("Jira credentials not found");
  });
});
