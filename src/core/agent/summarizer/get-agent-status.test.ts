/**
 * Tests for getAgentStatus function
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { getAgentStatus, clearSessionCache, clearAllSessionCache } from "./get-agent-status.ts";

// Mock dependencies
const mockGetPortForTicket = mock(() => 14100);
const mockCreateOpencodeClient = mock(() => ({
  session: {
    list: mock(() => Promise.resolve({ data: [] })),
    messages: mock(() => Promise.resolve({ data: [] })),
  },
}));

mock.module("#core/agent/orchestrator/opencode-client/port-manager.ts", () => ({
  getPortForTicket: mockGetPortForTicket,
}));

mock.module("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

// Note: We don't mock extract-status.ts here to avoid interfering with
// extract-status.test.ts. The real extractStatusFromMessage is a pure function
// that doesn't need mocking for these tests.

describe("getAgentStatus", () => {
  beforeEach(() => {
    mockGetPortForTicket.mockClear();
    mockCreateOpencodeClient.mockClear();

    mockGetPortForTicket.mockImplementation(() => 14100);

    // Clear caches before each test
    clearAllSessionCache();
  });

  it("should return empty array when no ticketId", async () => {
    const result = await getAgentStatus("", "/path/to/worktree");
    expect(result).toEqual([]);
  });

  it("should return empty array when no worktreePath", async () => {
    const result = await getAgentStatus("TEST-123", "");
    expect(result).toEqual([]);
  });

  it("should get port for ticket", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() => Promise.resolve({ data: [] })),
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(mockGetPortForTicket).toHaveBeenCalledWith("TEST-123");
  });

  it("should create client with correct baseUrl", async () => {
    mockGetPortForTicket.mockImplementation(() => 14123);
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() => Promise.resolve({ data: [] })),
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:14123",
    });
  });

  it("should cache client for same ticket", async () => {
    const mockList = mock(() => Promise.resolve({ data: [] }));
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mockList,
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    await getAgentStatus("TEST-123", "/path/to/worktree");
    await getAgentStatus("TEST-123", "/path/to/worktree");

    // Client should be created only once
    expect(mockCreateOpencodeClient).toHaveBeenCalledTimes(1);
  });

  it("should return empty array when no sessions found", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() => Promise.resolve({ data: [] })),
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });

  it("should get session with worktree path query", async () => {
    const mockList = mock(() => Promise.resolve({ data: [] }));
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mockList,
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(mockList).toHaveBeenCalledWith({
      query: { directory: "/path/to/worktree" },
    });
  });

  it("should use most recent session", async () => {
    const mockMessages = mock(() => Promise.resolve({ data: [] }));
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [
              { id: "session-1", time: { updated: 1000 } },
              { id: "session-2", time: { updated: 2000 } },
              { id: "session-3", time: { updated: 1500 } },
            ],
          }),
        ),
        messages: mockMessages,
      },
    }));

    await getAgentStatus("TEST-123", "/path/to/worktree");

    // Should use session-2 (most recent)
    expect(mockMessages).toHaveBeenCalledWith({ path: { id: "session-2" } });
  });

  it("should cache session ID", async () => {
    const mockList = mock(() =>
      Promise.resolve({
        data: [{ id: "cached-session", time: { updated: 1000 } }],
      }),
    );
    const mockMessages = mock(() => Promise.resolve({ data: [] }));

    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mockList,
        messages: mockMessages,
      },
    }));

    await getAgentStatus("TEST-123", "/path/to/worktree");
    await getAgentStatus("TEST-123", "/path/to/worktree");

    // Session list should only be called once
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("should extract status from assistant message", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1", time: { updated: 1000 } }],
          }),
        ),
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { role: "assistant" },
                parts: [{ type: "text", text: "Working on feature implementation" }],
              },
            ],
          }),
        ),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    // Real extractStatusFromMessage should produce at least 1 step
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].description.length).toBeGreaterThan(0);
  });

  it("should handle messages with multiple text parts", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1", time: { updated: 1000 } }],
          }),
        ),
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { role: "assistant" },
                parts: [
                  { type: "text", text: "Part 1" },
                  { type: "text", text: "Part 2" },
                ],
              },
            ],
          }),
        ),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    // The real extractStatusFromMessage processes "Part 1\nPart 2"
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("should skip non-assistant messages", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1", time: { updated: 1000 } }],
          }),
        ),
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { role: "user" },
                parts: [{ type: "text", text: "User message" }],
              },
              {
                info: { role: "system" },
                parts: [{ type: "text", text: "System message" }],
              },
            ],
          }),
        ),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });

  it("should return empty array when no messages", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1", time: { updated: 1000 } }],
          }),
        ),
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });

  it("should handle session list error gracefully", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() => Promise.reject(new Error("Connection failed"))),
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });

  it("should handle messages fetch error gracefully", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1", time: { updated: 1000 } }],
          }),
        ),
        messages: mock(() => Promise.reject(new Error("Fetch failed"))),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });

  it("should clear session cache for specific ticket", async () => {
    const mockList = mock(() =>
      Promise.resolve({
        data: [{ id: "session-1", time: { updated: 1000 } }],
      }),
    );
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mockList,
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    // First call - caches session
    await getAgentStatus("TEST-123", "/path/to/worktree");
    expect(mockList).toHaveBeenCalledTimes(1);

    // Clear cache
    clearSessionCache("TEST-123");

    // Second call - should fetch again
    await getAgentStatus("TEST-123", "/path/to/worktree");
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("should clear all session caches", async () => {
    const mockList1 = mock(() =>
      Promise.resolve({
        data: [{ id: "session-1", time: { updated: 1000 } }],
      }),
    );
    const mockList2 = mock(() =>
      Promise.resolve({
        data: [{ id: "session-2", time: { updated: 1000 } }],
      }),
    );

    mockCreateOpencodeClient
      .mockImplementationOnce(() => ({
        session: {
          list: mockList1,
          messages: mock(() => Promise.resolve({ data: [] })),
        },
      }))
      .mockImplementationOnce(() => ({
        session: {
          list: mockList2,
          messages: mock(() => Promise.resolve({ data: [] })),
        },
      }));

    // Call for two different tickets
    await getAgentStatus("TEST-123", "/path/1");
    await getAgentStatus("TEST-456", "/path/2");

    // Clear all caches
    clearAllSessionCache();

    // Create new mocks for second round
    mockCreateOpencodeClient
      .mockImplementationOnce(() => ({
        session: {
          list: mockList1,
          messages: mock(() => Promise.resolve({ data: [] })),
        },
      }))
      .mockImplementationOnce(() => ({
        session: {
          list: mockList2,
          messages: mock(() => Promise.resolve({ data: [] })),
        },
      }));

    // Should create new clients
    await getAgentStatus("TEST-123", "/path/1");
    await getAgentStatus("TEST-456", "/path/2");

    expect(mockCreateOpencodeClient).toHaveBeenCalledTimes(4);
  });

  it("should handle sessions without time data", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1" }, { id: "session-2" }],
          }),
        ),
        messages: mock(() => Promise.resolve({ data: [] })),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });

  it("should handle messages without parts", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1", time: { updated: 1000 } }],
          }),
        ),
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { role: "assistant" },
                // No parts
              },
            ],
          }),
        ),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });

  it("should handle non-text parts in messages", async () => {
    mockCreateOpencodeClient.mockImplementation(() => ({
      session: {
        list: mock(() =>
          Promise.resolve({
            data: [{ id: "session-1", time: { updated: 1000 } }],
          }),
        ),
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { role: "assistant" },
                parts: [
                  { type: "image", url: "http://example.com/image.png" },
                  { type: "tool_use", name: "some_tool" },
                ],
              },
            ],
          }),
        ),
      },
    }));

    const result = await getAgentStatus("TEST-123", "/path/to/worktree");

    expect(result).toEqual([]);
  });
});
