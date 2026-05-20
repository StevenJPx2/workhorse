/**
 * Tests for Jira credentials module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as keychain from "workhorse-core";

import { loadCredentials, saveCredentials, createCredentialGetter } from "../credentials.ts";

vi.mock("workhorse-core", () => ({
  getCredential: vi.fn(),
  storeCredential: vi.fn(),
  deleteCredential: vi.fn(),
  // Re-export other things that might be needed
  PluginSymbol: Symbol.for("workhorse.plugin"),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Clear environment variables
  delete process.env.JIRA_EMAIL;
  delete process.env.JIRA_API_TOKEN;
  delete process.env.JIRA_SITE_URL;
});

describe("loadCredentials", () => {
  it("returns null when no credentials stored", async () => {
    vi.mocked(keychain.getCredential).mockResolvedValue(null);

    const creds = await loadCredentials();
    expect(creds).toBeNull();
  });

  it("returns credentials from keychain when stored", async () => {
    vi.mocked(keychain.getCredential)
      .mockResolvedValueOnce("user@example.com")
      .mockResolvedValueOnce("api-token-123")
      .mockResolvedValueOnce("company.atlassian.net");

    const creds = await loadCredentials();
    expect(creds).toEqual({
      email: "user@example.com",
      apiToken: "api-token-123",
      siteUrl: "company.atlassian.net",
    });
  });

  it("prefers environment variables over keychain", async () => {
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";
    process.env.JIRA_SITE_URL = "env.atlassian.net";

    const creds = await loadCredentials();
    expect(creds).toEqual({
      email: "env@example.com",
      apiToken: "env-token",
      siteUrl: "env.atlassian.net",
    });

    // Should not have called keychain
    expect(keychain.getCredential).not.toHaveBeenCalled();
  });

  it("resolves env var references in keychain values", async () => {
    process.env.MY_EMAIL = "resolved@example.com";
    process.env.MY_TOKEN = "resolved-token";

    vi.mocked(keychain.getCredential)
      .mockResolvedValueOnce("$MY_EMAIL")
      .mockResolvedValueOnce("$MY_TOKEN")
      .mockResolvedValueOnce("direct.atlassian.net");

    const creds = await loadCredentials();
    expect(creds).toEqual({
      email: "resolved@example.com",
      apiToken: "resolved-token",
      siteUrl: "direct.atlassian.net",
    });
  });
});

describe("saveCredentials", () => {
  it("stores all credential fields", async () => {
    vi.mocked(keychain.storeCredential).mockResolvedValue(undefined);

    await saveCredentials({
      email: "user@example.com",
      apiToken: "token123",
      siteUrl: "company.atlassian.net",
    });

    expect(keychain.storeCredential).toHaveBeenCalledWith("jira", "email", "user@example.com");
    expect(keychain.storeCredential).toHaveBeenCalledWith("jira", "api_token", "token123");
    expect(keychain.storeCredential).toHaveBeenCalledWith(
      "jira",
      "site_url",
      "company.atlassian.net",
    );
  });
});

describe("createCredentialGetter", () => {
  it("returns credentials when available", async () => {
    vi.mocked(keychain.getCredential)
      .mockResolvedValueOnce("user@example.com")
      .mockResolvedValueOnce("token123")
      .mockResolvedValueOnce("company.atlassian.net");

    const getter = createCredentialGetter();
    const creds = await getter();

    expect(creds.email).toBe("user@example.com");
    expect(creds.apiToken).toBe("token123");
  });

  it("throws when credentials missing", async () => {
    vi.mocked(keychain.getCredential).mockResolvedValue(null);

    const getter = createCredentialGetter();
    await expect(getter()).rejects.toThrow("Jira credentials not found");
  });
});
