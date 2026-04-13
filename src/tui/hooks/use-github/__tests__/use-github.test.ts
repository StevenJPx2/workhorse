/**
 * Tests for useGitHub hook
 *
 * Uses dependency injection to mock the GitHubClient.
 */

import { describe, it, expect, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useGitHub } from "../use-github.ts";
import type {
  GitHubClient as GitHubClientInterface,
  GitHubPullRequest,
} from "#core/github/types.ts";

function createMockClient(overrides: Record<string, unknown> = {}) {
  const connected = { value: false };
  return {
    get isConnected() {
      return connected.value;
    },
    connect: mock(async () => {
      connected.value = true;
    }),
    disconnect: mock(async () => {
      connected.value = false;
    }),
    getPullRequest: mock(async () => ({}) as GitHubPullRequest),
    listPullRequests: mock(async () => []),
    listReviewComments: mock(async () => []),
    listReviews: mock(async () => []),
    createReview: mock(async () => {}),
    createReviewComment: mock(async () => {}),
    ...overrides,
  };
}

describe("useGitHub", () => {
  it("starts disconnected", () => {
    const client = createMockClient();
    createRoot((dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );
      expect(hook.isConnected()).toBe(false);
      expect(hook.isConnecting()).toBe(false);
      expect(hook.error()).toBeNull();
      dispose();
    });
  });

  it("connects successfully", async () => {
    const client = createMockClient();
    let connectedFlag = false;

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {
          onConnectionChange: (connected) => {
            connectedFlag = connected;
          },
        },
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.connect();

      expect(hook.isConnected()).toBe(true);
      expect(connectedFlag).toBe(true);
      expect(client.connect).toHaveBeenCalledTimes(1);
      dispose();
    });
  });

  it("handles connection errors", async () => {
    const client = createMockClient({
      connect: mock(async () => {
        throw new Error("Connection failed");
      }),
    });

    await createRoot(async (dispose) => {
      const capturedErrors: Error[] = [];

      const hook = useGitHub(
        {
          onError: (err) => {
            capturedErrors.push(err);
          },
        },
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await expect(hook.connect()).rejects.toThrow("Connection failed");
      expect(hook.isConnected()).toBe(false);
      expect(hook.error()).not.toBeNull();
      expect(hook.error()?.message).toBe("Connection failed");
      expect(capturedErrors.length).toBe(1);
      expect(capturedErrors[0].message).toBe("Connection failed");
      dispose();
    });
  });

  it("deduplicates concurrent connection attempts", async () => {
    const client = createMockClient();

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await Promise.all([hook.connect(), hook.connect()]);

      expect(hook.isConnected()).toBe(true);
      // connect should only be called once despite two connect() calls
      expect(client.connect).toHaveBeenCalledTimes(1);
      dispose();
    });
  });

  it("disconnects successfully", async () => {
    const client = createMockClient();

    await createRoot(async (dispose) => {
      let lastConnectedState = false;

      const hook = useGitHub(
        {
          onConnectionChange: (connected) => {
            lastConnectedState = connected;
          },
        },
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.connect();
      expect(hook.isConnected()).toBe(true);

      await hook.disconnect();
      expect(hook.isConnected()).toBe(false);
      expect(lastConnectedState).toBe(false);
      dispose();
    });
  });

  it("handles disconnect errors", async () => {
    const client = createMockClient({
      disconnect: mock(async () => {
        throw new Error("Disconnect failed");
      }),
    });

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.connect();

      await expect(hook.disconnect()).rejects.toThrow("Disconnect failed");
      expect(hook.error()).not.toBeNull();
      dispose();
    });
  });

  it("auto-connects when autoConnect is true", async () => {
    const client = createMockClient();

    await createRoot(async (dispose) => {
      useGitHub(
        { autoConnect: true },
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      // Wait for auto-connect
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(client.connect).toHaveBeenCalledTimes(1);
      dispose();
    });
  });

  it("calls getPullRequest via ensureConnected", async () => {
    const client = createMockClient();

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.getPullRequest("owner", "repo", 42);

      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(client.getPullRequest).toHaveBeenCalledWith("owner", "repo", 42);
      dispose();
    });
  });

  it("calls listPullRequests via ensureConnected", async () => {
    const client = createMockClient();

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.listPullRequests("owner", "repo", "open");

      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(client.listPullRequests).toHaveBeenCalledWith("owner", "repo", "open");
      dispose();
    });
  });

  it("calls listReviewComments via ensureConnected", async () => {
    const client = createMockClient();

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.listReviewComments("owner", "repo", 42);

      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(client.listReviewComments).toHaveBeenCalledWith("owner", "repo", 42);
      dispose();
    });
  });

  it("calls createReview via ensureConnected", async () => {
    const client = createMockClient();
    const params = { body: "LGTM", event: "APPROVE" as const };

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.createReview("owner", "repo", 42, params);

      expect(client.createReview).toHaveBeenCalledWith("owner", "repo", 42, params);
      dispose();
    });
  });

  it("calls createReviewComment via ensureConnected", async () => {
    const client = createMockClient();

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.createReviewComment("owner", "repo", 42, "Nice work!", 100);

      expect(client.createReviewComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "Nice work!",
        100,
      );
      dispose();
    });
  });

  it("handles API errors gracefully", async () => {
    const client = createMockClient({
      getPullRequest: mock(async () => {
        throw new Error("PR not found");
      }),
    });

    await createRoot(async (dispose) => {
      const hook = useGitHub(
        {},
        { createClient: () => client as unknown as GitHubClientInterface },
      );

      await hook.connect();

      await expect(hook.getPullRequest("owner", "repo", 999)).rejects.toThrow("PR not found");
      expect(hook.error()).not.toBeNull();
      expect(hook.error()?.message).toBe("PR not found");
      dispose();
    });
  });
});
