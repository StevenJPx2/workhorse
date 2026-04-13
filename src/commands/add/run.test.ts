/**
 * Tests for add command runner
 *
 * These tests mock @clack/prompts and process.exit to test the command flow.
 */

import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";

// Mock @clack/prompts
const mockOutro = mock(() => {});
const mockConfirm = mock(() => Promise.resolve(true) as Promise<boolean | symbol>);
const mockSpinnerInstance = {
  start: mock(() => {}),
  stop: mock(() => {}),
  message: mock(() => {}),
};
const mockSpinner = mock(() => mockSpinnerInstance);
const mockLog = {
  success: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  message: mock(() => {}),
};
const mockIsCancel = mock((value: unknown) => value === Symbol.for("cancel"));

mock.module("@clack/prompts", () => ({
  outro: mockOutro,
  confirm: mockConfirm,
  spinner: mockSpinner,
  log: mockLog,
  isCancel: mockIsCancel,
}));

// Mock process.exit
const mockExit = mock((code?: number) => {
  throw new Error(`process.exit(${code})`);
});

// Track original process.exit
const originalExit = process.exit;

// Types for mocks
type RigInfo = {
  rig: string;
  gitRoot: string;
  remoteUrl: string;
} | null;

type ResolvedConfig = {
  jira: { cloud_id: string };
  defaults: { agent: "opencode" | "claude" };
};

type Ticket = {
  id: string;
  jira_key: string;
  status: string;
  rig: string;
  jira_url?: string | null;
  agent?: string;
  created_at?: string;
  updated_at?: string;
} | null;

// Mock detectRig
const mockDetectRig = mock(
  (): Promise<RigInfo> =>
    Promise.resolve({
      rig: "github.com/test/repo",
      gitRoot: "/path/to/repo",
      remoteUrl: "git@github.com:test/repo.git",
    }),
);

mock.module("../../lib/detect-rig.ts", () => ({
  detectRig: mockDetectRig,
}));

// Mock config
const mockConfigExists = mock(() => true);
const mockLoadConfig = mock(
  (): Promise<ResolvedConfig> =>
    Promise.resolve({
      jira: { cloud_id: "test.atlassian.net" },
      defaults: { agent: "opencode" },
    }),
);

mock.module("../../lib/config.ts", () => ({
  configExists: mockConfigExists,
  loadConfig: mockLoadConfig,
}));

// Mock db
const mockInsertTicket = mock(
  (ticket: {
    id: string;
    jira_key: string;
    rig: string;
    jira_url?: string;
    agent?: string;
    summary?: string;
  }) => ({
    id: ticket.id,
    jira_key: ticket.jira_key,
    rig: ticket.rig,
    jira_url: ticket.jira_url || null,
    agent: ticket.agent || "opencode",
    status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
);
const mockGetTicketById = mock((_id: string): Ticket => null);
const mockUpdateTicket = mock((_id: string, _updates: unknown) => {});
const mockInitDatabase = mock(() => {});

mock.module("../../lib/db.ts", () => ({
  insertTicket: mockInsertTicket,
  getTicketById: mockGetTicketById,
  updateTicket: mockUpdateTicket,
  initDatabase: mockInitDatabase,
}));

// Mock Atlassian client
const mockJiraIssue = {
  key: "TEST-123",
  summary: "Test issue from Jira",
  description: "Test description",
  status: "Open",
  priority: "High",
  assignee: "John Doe",
  reporter: "Jane Doe",
  issueType: "Bug",
  url: "https://test.atlassian.net/browse/TEST-123",
  projectKey: "TEST",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-02T00:00:00Z",
};

const mockConnect = mock(() => Promise.resolve());
const mockDisconnect = mock(() => Promise.resolve());
const mockFetchIssue = mock((_key: string) => Promise.resolve(mockJiraIssue));

const mockCreateAtlassianClient = mock((_options: { cloudId: string }) => ({
  connect: mockConnect,
  disconnect: mockDisconnect,
  fetchIssue: mockFetchIssue,
}));

mock.module("../../hooks/use-atlassian/index.ts", () => ({
  createAtlassianClient: mockCreateAtlassianClient,
}));

// Now import the module under test
import { runAdd } from "./run.ts";

describe("add/run", () => {
  beforeEach(() => {
    // Reset all mocks
    mockOutro.mockClear();
    mockConfirm.mockClear();
    mockSpinner.mockClear();
    mockSpinnerInstance.start.mockClear();
    mockSpinnerInstance.stop.mockClear();
    mockSpinnerInstance.message.mockClear();
    mockLog.success.mockClear();
    mockLog.error.mockClear();
    mockLog.warn.mockClear();
    mockLog.message.mockClear();
    mockExit.mockClear();
    mockDetectRig.mockClear();
    mockConfigExists.mockClear();
    mockLoadConfig.mockClear();
    mockInsertTicket.mockClear();
    mockGetTicketById.mockClear();
    mockUpdateTicket.mockClear();
    mockInitDatabase.mockClear();
    mockCreateAtlassianClient.mockClear();
    mockConnect.mockClear();
    mockDisconnect.mockClear();
    mockFetchIssue.mockClear();

    // Reset insertTicket to default implementation
    mockInsertTicket.mockImplementation((ticket) => ({
      id: ticket.id,
      jira_key: ticket.jira_key,
      rig: ticket.rig,
      jira_url: ticket.jira_url || null,
      agent: ticket.agent || "opencode",
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // Reset Atlassian client mocks to default
    mockConnect.mockImplementation(() => Promise.resolve());
    mockDisconnect.mockImplementation(() => Promise.resolve());
    mockFetchIssue.mockImplementation(() => Promise.resolve(mockJiraIssue));
    mockCreateAtlassianClient.mockImplementation(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
      fetchIssue: mockFetchIssue,
    }));

    // Default mock implementations
    mockConfigExists.mockImplementation(() => true);
    mockDetectRig.mockImplementation(
      (): Promise<RigInfo> =>
        Promise.resolve({
          rig: "github.com/test/repo",
          gitRoot: "/path/to/repo",
          remoteUrl: "git@github.com:test/repo.git",
        }),
    );
    mockLoadConfig.mockImplementation(
      (): Promise<ResolvedConfig> =>
        Promise.resolve({
          jira: { cloud_id: "test.atlassian.net" },
          defaults: { agent: "opencode" },
        }),
    );
    mockGetTicketById.mockImplementation((): Ticket => null);
    mockConfirm.mockImplementation(() => Promise.resolve(true) as Promise<boolean | symbol>);
    mockIsCancel.mockImplementation((value: unknown) => value === Symbol.for("cancel"));

    // Mock process.exit
    process.exit = mockExit as unknown as (code?: number) => never;
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalExit;
  });

  describe("runAdd", () => {
    it("should exit with error if config does not exist", async () => {
      mockConfigExists.mockImplementation(() => false);

      await expect(runAdd("TEST-123", {})).rejects.toThrow("process.exit(1)");

      expect(mockLog.error).toHaveBeenCalledWith(
        "Jiratown is not configured. Run 'jiratown setup' first.",
      );
    });

    it("should exit with error if not in git repo", async () => {
      mockDetectRig.mockImplementation((): Promise<RigInfo> => Promise.resolve(null));

      await expect(runAdd("TEST-123", {})).rejects.toThrow("process.exit(1)");

      expect(mockLog.error).toHaveBeenCalledWith(
        "Not in a git repository with a remote. Please run from a git repo.",
      );
    });

    it("should exit with error for invalid ticket key", async () => {
      await expect(runAdd("invalid", {})).rejects.toThrow("process.exit(1)");

      expect(mockLog.error).toHaveBeenCalledWith('Invalid ticket key format: "invalid"');
      expect(mockLog.message).toHaveBeenCalledWith(
        "Expected format: PROJECT-123 (e.g., AM-123, JIRA-456)",
      );
    });

    it("should add a new ticket successfully with Jira data", async () => {
      await runAdd("TEST-123", {});

      expect(mockConnect).toHaveBeenCalled();
      expect(mockFetchIssue).toHaveBeenCalledWith("TEST-123");
      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockInsertTicket).toHaveBeenCalledWith({
        id: "TEST-123",
        jira_key: "TEST-123",
        rig: "github.com/test/repo",
        jira_url: "https://test.atlassian.net/browse/TEST-123",
        summary: "Test issue from Jira",
        agent: "opencode",
      });

      expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Fetched: Test issue from Jira");
      expect(mockLog.success).toHaveBeenCalledWith("Ticket: TEST-123");
      expect(mockLog.message).toHaveBeenCalledWith("  Summary: Test issue from Jira");
      expect(mockOutro).toHaveBeenCalledWith("Run 'jiratown' to view and manage tickets.");
    });

    it("should add ticket in offline mode without fetching from Jira", async () => {
      await runAdd("TEST-123", { offline: true });

      expect(mockConnect).not.toHaveBeenCalled();
      expect(mockFetchIssue).not.toHaveBeenCalled();
      expect(mockInsertTicket).toHaveBeenCalledWith({
        id: "TEST-123",
        jira_key: "TEST-123",
        rig: "github.com/test/repo",
        jira_url: undefined,
        summary: undefined,
        agent: "opencode",
      });

      expect(mockOutro).toHaveBeenCalledWith("Run 'jiratown' to view and manage tickets.");
    });

    it("should add ticket from URL with Jira data", async () => {
      await runAdd("https://company.atlassian.net/browse/PROJ-456", {});

      expect(mockInsertTicket).toHaveBeenCalledWith({
        id: "PROJ-456",
        jira_key: "PROJ-456",
        rig: "github.com/test/repo",
        jira_url: "https://test.atlassian.net/browse/TEST-123", // From mock Jira issue
        summary: "Test issue from Jira",
        agent: "opencode",
      });
    });

    it("should use agent from options if provided", async () => {
      await runAdd("TEST-123", { agent: "claude" });

      expect(mockInsertTicket).toHaveBeenCalledWith(expect.objectContaining({ agent: "claude" }));
    });

    it("should exit with error for invalid agent", async () => {
      await expect(runAdd("TEST-123", { agent: "invalid" })).rejects.toThrow("process.exit(1)");

      expect(mockLog.error).toHaveBeenCalledWith(
        'Invalid agent: "invalid". Must be "opencode" or "claude".',
      );
    });

    it("should handle existing ticket and user declining update", async () => {
      mockGetTicketById.mockImplementation(
        (): Ticket => ({
          id: "TEST-123",
          jira_key: "TEST-123",
          status: "pending",
          rig: "github.com/test/repo",
        }),
      );

      mockConfirm.mockImplementation(() => Promise.resolve(false) as Promise<boolean | symbol>);

      await runAdd("TEST-123", {});

      expect(mockLog.warn).toHaveBeenCalledWith(
        "Ticket TEST-123 already exists with status: pending",
      );
      expect(mockOutro).toHaveBeenCalledWith("Cancelled.");
      expect(mockInsertTicket).not.toHaveBeenCalled();
    });

    it("should handle existing ticket and user cancelling", async () => {
      mockGetTicketById.mockImplementation(
        (): Ticket => ({
          id: "TEST-123",
          jira_key: "TEST-123",
          status: "implementing",
          rig: "github.com/test/repo",
        }),
      );

      mockConfirm.mockImplementation(
        () => Promise.resolve(Symbol.for("cancel")) as Promise<boolean | symbol>,
      );
      mockIsCancel.mockImplementation((value: unknown) => value === Symbol.for("cancel"));

      await runAdd("TEST-123", {});

      expect(mockOutro).toHaveBeenCalledWith("Cancelled.");
    });

    it("should update existing ticket with fresh Jira data when confirmed", async () => {
      mockGetTicketById.mockImplementation(
        (): Ticket => ({
          id: "TEST-123",
          jira_key: "TEST-123",
          status: "pending",
          rig: "github.com/test/repo",
        }),
      );

      mockConfirm.mockImplementation(() => Promise.resolve(true) as Promise<boolean | symbol>);

      await runAdd("TEST-123", {});

      expect(mockUpdateTicket).toHaveBeenCalledWith(
        "TEST-123",
        expect.objectContaining({
          summary: "Test issue from Jira",
          agent: "opencode",
        }),
      );
      expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Updated ticket TEST-123");
    });

    it("should display ticket URL when present", async () => {
      mockInsertTicket.mockImplementation((ticket) => ({
        id: ticket.id,
        jira_key: ticket.jira_key,
        rig: ticket.rig,
        jira_url: ticket.jira_url || null,
        agent: ticket.agent || "opencode",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await runAdd("URL-123", {});

      expect(mockLog.message).toHaveBeenCalledWith(
        "  URL: https://test.atlassian.net/browse/TEST-123",
      );
    });

    it("should handle Jira fetch failure gracefully and continue", async () => {
      mockFetchIssue.mockImplementation(() => Promise.reject(new Error("Network error")));

      await runAdd("FAIL-123", {});

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not fetch ticket from Jira"),
      );
      expect(mockLog.message).toHaveBeenCalledWith("Continuing with basic ticket info...");
      // Still inserts ticket
      expect(mockInsertTicket).toHaveBeenCalled();
    });

    it("should handle insertTicket error", async () => {
      mockInsertTicket.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(runAdd("TEST-123", {})).rejects.toThrow("process.exit(1)");

      expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Failed to add ticket");
      expect(mockLog.error).toHaveBeenCalledWith("Error: Database error");
    });

    it("should display all ticket info after creation", async () => {
      await runAdd("INFO-123", {});

      expect(mockLog.success).toHaveBeenCalledWith("Ticket: INFO-123");
      expect(mockLog.message).toHaveBeenCalledWith("  Summary: Test issue from Jira");
      expect(mockLog.message).toHaveBeenCalledWith("  Status: Open");
      expect(mockLog.message).toHaveBeenCalledWith("  Type: Bug");
      expect(mockLog.message).toHaveBeenCalledWith("  Rig: github.com/test/repo");
      expect(mockLog.message).toHaveBeenCalledWith("  Agent: opencode");
    });

    it("should use default agent from config", async () => {
      mockLoadConfig.mockImplementation(
        (): Promise<ResolvedConfig> =>
          Promise.resolve({
            jira: { cloud_id: "test.atlassian.net" },
            defaults: { agent: "claude" },
          }),
      );

      await runAdd("DEFAULT-123", {});

      expect(mockInsertTicket).toHaveBeenCalledWith(expect.objectContaining({ agent: "claude" }));
    });
  });
});
