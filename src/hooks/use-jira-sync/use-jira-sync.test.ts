import { describe, it, expect, mock } from "bun:test";
import { useJiraSync } from "./use-jira-sync.ts";

describe("useJiraSync", () => {
  it("returns sync functions", () => {
    const result = useJiraSync();
    expect(typeof result.postProgress).toBe("function");
    expect(typeof result.transitionStatus).toBe("function");
    expect(typeof result.linkPR).toBe("function");
    expect(typeof result.syncAll).toBe("function");
    expect(typeof result.isSyncing).toBe("function");
    expect(typeof result.syncStatus).toBe("function");
  });

  it("accepts options with cloudId", () => {
    const result = useJiraSync({ cloudId: "test.atlassian.net" });
    expect(result).toBeDefined();
  });

  it("accepts options with cloudId as a getter", () => {
    const result = useJiraSync({ cloudId: () => "test.atlassian.net" });
    expect(result).toBeDefined();
  });

  it("accepts error and success callbacks", () => {
    const onError = mock(() => {});
    const onSuccess = mock(() => {});
    const result = useJiraSync({
      onSyncError: onError,
      onSyncSuccess: onSuccess,
    });
    expect(result).toBeDefined();
  });

  it("initializes with empty sync statuses", () => {
    const result = useJiraSync();
    expect(Object.keys(result.syncStatus())).toHaveLength(0);
  });

  it("initializes as not syncing", () => {
    const result = useJiraSync();
    expect(result.isSyncing()).toBe(false);
  });
});