/**
 * Tests for setup command runner
 *
 * These tests mock @clack/prompts and other dependencies to test the interactive flow.
 */

import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";

// Mock @clack/prompts before importing runSetup
const mockIntro = mock(() => {});
const mockOutro = mock(() => {});
const mockConfirm = mock(() => Promise.resolve(true) as Promise<boolean | symbol>);
const mockText = mock(() => Promise.resolve("test.atlassian.net") as Promise<string | symbol>);
const mockSelect = mock(() => Promise.resolve("opencode") as Promise<string | symbol>);
const mockSpinnerInstance = {
  start: mock(() => {}),
  stop: mock(() => {}),
  message: mock(() => {}),
};
const mockSpinner = mock(() => mockSpinnerInstance);
const mockLog = {
  step: mock(() => {}),
  success: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  message: mock(() => {}),
};
const mockIsCancel = mock((value: unknown) => value === Symbol.for("cancel"));

mock.module("@clack/prompts", () => ({
  intro: mockIntro,
  outro: mockOutro,
  confirm: mockConfirm,
  text: mockText,
  select: mockSelect,
  spinner: mockSpinner,
  log: mockLog,
  isCancel: mockIsCancel,
}));

// Type for dependency check results
type DependencyCheckResult = {
  available: { name: string; installHint?: string }[];
  missing: { name: string; installHint?: string }[];
};

// Mock checkAllDependencies
const mockCheckAllDependencies = mock((): Promise<DependencyCheckResult> =>
  Promise.resolve({ available: [{ name: "Bun" }], missing: [] })
);

mock.module("./dependencies.ts", () => ({
  checkAllDependencies: mockCheckAllDependencies,
}));

// Mock config functions
const mockEnsureConfigDir = mock(() => "/home/test/.jiratown");
const mockSaveGlobalConfig = mock(() => {});
const mockGetConfigPaths = mock(() => ({
  globalDir: "/home/test/.jiratown",
  globalConfig: "/home/test/.jiratown/config.toml",
  database: "/home/test/.jiratown/jiratown.db",
  projectConfig: null,
}));
const mockConfigExists = mock(() => false);

mock.module("../../lib/config.ts", () => ({
  ensureConfigDir: mockEnsureConfigDir,
  saveGlobalConfig: mockSaveGlobalConfig,
  getConfigPaths: mockGetConfigPaths,
  configExists: mockConfigExists,
}));

// Mock db functions
const mockInitDatabase = mock(() => ({}));

mock.module("../../lib/db.ts", () => ({
  initDatabase: mockInitDatabase,
}));

// Now import the module under test
import { runSetup } from "./run.ts";

describe("setup/run", () => {
  beforeEach(() => {
    // Reset all mocks
    mockIntro.mockClear();
    mockOutro.mockClear();
    mockConfirm.mockClear();
    mockText.mockClear();
    mockSelect.mockClear();
    mockSpinner.mockClear();
    mockSpinnerInstance.start.mockClear();
    mockSpinnerInstance.stop.mockClear();
    mockSpinnerInstance.message.mockClear();
    mockLog.step.mockClear();
    mockLog.success.mockClear();
    mockLog.error.mockClear();
    mockLog.warn.mockClear();
    mockLog.message.mockClear();
    mockCheckAllDependencies.mockClear();
    mockEnsureConfigDir.mockClear();
    mockSaveGlobalConfig.mockClear();
    mockGetConfigPaths.mockClear();
    mockConfigExists.mockClear();
    mockInitDatabase.mockClear();

    // Default mock implementations
    mockConfirm.mockImplementation(() => Promise.resolve(true) as Promise<boolean | symbol>);
    mockText.mockImplementation(() => Promise.resolve("test.atlassian.net") as Promise<string | symbol>);
    mockSelect.mockImplementation(() => Promise.resolve("opencode") as Promise<string | symbol>);
    mockIsCancel.mockImplementation((value: unknown) => value === Symbol.for("cancel"));
    mockCheckAllDependencies.mockImplementation((): Promise<DependencyCheckResult> =>
      Promise.resolve({ available: [{ name: "Bun" }], missing: [] })
    );
    mockConfigExists.mockImplementation(() => false);
    mockEnsureConfigDir.mockImplementation(() => "/home/test/.jiratown");
    mockSaveGlobalConfig.mockImplementation(() => {});
    mockInitDatabase.mockImplementation(() => ({}));
  });

  describe("runSetup", () => {
    it("should show intro message", async () => {
      await runSetup();
      expect(mockIntro).toHaveBeenCalledWith("Jiratown Setup");
    });

    it("should ask to reconfigure if config already exists", async () => {
      mockConfigExists.mockImplementation(() => true);
      mockConfirm.mockImplementation(() => Promise.resolve(false) as Promise<boolean | symbol>);

      await runSetup();

      expect(mockConfirm).toHaveBeenCalled();
      expect(mockOutro).toHaveBeenCalledWith("Setup cancelled.");
    });

    it("should handle user cancelling reconfigure prompt", async () => {
      mockConfigExists.mockImplementation(() => true);
      mockConfirm.mockImplementation(() => Promise.resolve(Symbol.for("cancel")) as Promise<boolean | symbol>);
      mockIsCancel.mockImplementation((value: unknown) => value === Symbol.for("cancel"));

      await runSetup();

      expect(mockOutro).toHaveBeenCalledWith("Setup cancelled.");
    });

    it("should proceed with setup when no existing config", async () => {
      await runSetup();

      expect(mockText).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalled();
      expect(mockOutro).toHaveBeenCalledWith(
        "Setup complete! Run 'jiratown' in any git repo to start."
      );
    });

    it("should save configuration after successful setup", async () => {
      mockText.mockImplementation(() => Promise.resolve("mycompany.atlassian.net") as Promise<string | symbol>);
      mockSelect.mockImplementation(() => Promise.resolve("claude") as Promise<string | symbol>);

      await runSetup();

      expect(mockSaveGlobalConfig).toHaveBeenCalledWith({
        jira: { cloud_id: "mycompany.atlassian.net" },
        defaults: { agent: "claude" },
      });
    });

    it("should handle user cancelling Jira cloud ID prompt", async () => {
      mockText.mockImplementation(() => Promise.resolve(Symbol.for("cancel")) as Promise<string | symbol>);
      mockIsCancel.mockImplementation((value: unknown) => value === Symbol.for("cancel"));

      await runSetup();

      expect(mockOutro).toHaveBeenCalledWith("Setup cancelled.");
    });

    it("should handle user cancelling agent selection", async () => {
      mockText.mockImplementation(() => Promise.resolve("test.atlassian.net") as Promise<string | symbol>);
      mockSelect.mockImplementation(() => Promise.resolve(Symbol.for("cancel")) as Promise<string | symbol>);
      mockIsCancel.mockImplementation((value: unknown) => value === Symbol.for("cancel"));

      await runSetup();

      expect(mockOutro).toHaveBeenCalledWith("Setup cancelled.");
    });

    it("should check dependencies", async () => {
      await runSetup();

      expect(mockLog.step).toHaveBeenCalledWith("Checking dependencies...");
      expect(mockLog.success).toHaveBeenCalled();
    });

    it("should initialize database", async () => {
      await runSetup();

      expect(mockInitDatabase).toHaveBeenCalled();
    });

    it("should allow reconfiguration when user confirms", async () => {
      mockConfigExists.mockImplementation(() => true);
      mockConfirm.mockImplementation(() => Promise.resolve(true) as Promise<boolean | symbol>);
      mockText.mockImplementation(() => Promise.resolve("new.atlassian.net") as Promise<string | symbol>);
      mockSelect.mockImplementation(() => Promise.resolve("opencode") as Promise<string | symbol>);

      await runSetup();

      expect(mockSaveGlobalConfig).toHaveBeenCalledWith({
        jira: { cloud_id: "new.atlassian.net" },
        defaults: { agent: "opencode" },
      });
    });

    it("should handle missing dependencies and user declining to continue", async () => {
      mockCheckAllDependencies.mockImplementation((): Promise<DependencyCheckResult> =>
        Promise.resolve({
          available: [{ name: "Bun" }],
          missing: [{ name: "Gas Town", installHint: "brew install gastown" }],
        })
      );
      mockConfirm.mockImplementation(() => Promise.resolve(false) as Promise<boolean | symbol>);

      await runSetup();

      expect(mockLog.warn).toHaveBeenCalledWith("\nMissing dependencies:");
      expect(mockLog.message).toHaveBeenCalledWith("  - Gas Town: brew install gastown");
      expect(mockOutro).toHaveBeenCalledWith(
        "Setup cancelled. Please install missing dependencies and try again."
      );
    });

    it("should handle missing dependencies without installHint", async () => {
      mockCheckAllDependencies.mockImplementation((): Promise<DependencyCheckResult> =>
        Promise.resolve({
          available: [{ name: "Bun" }],
          missing: [{ name: "Gas Town" }],
        })
      );
      mockConfirm.mockImplementation(() => Promise.resolve(true) as Promise<boolean | symbol>);

      await runSetup();

      expect(mockLog.message).toHaveBeenCalledWith("  - Gas Town");
      expect(mockOutro).toHaveBeenCalledWith(
        "Setup complete! Run 'jiratown' in any git repo to start."
      );
    });

    it("should handle user cancelling missing dependencies prompt", async () => {
      mockCheckAllDependencies.mockImplementation((): Promise<DependencyCheckResult> =>
        Promise.resolve({
          available: [],
          missing: [{ name: "Gas Town" }],
        })
      );
      mockConfirm.mockImplementation(() => Promise.resolve(Symbol.for("cancel")) as Promise<boolean | symbol>);
      mockIsCancel.mockImplementation((value: unknown) => value === Symbol.for("cancel"));

      await runSetup();

      expect(mockOutro).toHaveBeenCalledWith(
        "Setup cancelled. Please install missing dependencies and try again."
      );
    });

    it("should log error for each missing dependency", async () => {
      mockCheckAllDependencies.mockImplementation((): Promise<DependencyCheckResult> =>
        Promise.resolve({
          available: [],
          missing: [
            { name: "Gas Town" },
            { name: "OpenCode" },
          ],
        })
      );
      mockConfirm.mockImplementation(() => Promise.resolve(false) as Promise<boolean | symbol>);

      await runSetup();

      expect(mockLog.error).toHaveBeenCalledWith("Gas Town not found");
      expect(mockLog.error).toHaveBeenCalledWith("OpenCode not found");
    });

    it("should verify spinner is used during save", async () => {
      await runSetup();

      expect(mockSpinnerInstance.start).toHaveBeenCalledWith("Saving configuration...");
      expect(mockSpinnerInstance.message).toHaveBeenCalledWith("Initializing database...");
      expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Configuration saved!");
    });

    it("should log success messages after save", async () => {
      await runSetup();

      expect(mockLog.success).toHaveBeenCalledWith("Config: /home/test/.jiratown/config.toml");
      expect(mockLog.success).toHaveBeenCalledWith("Database: /home/test/.jiratown/jiratown.db");
    });

    it("should test text validation function", async () => {
      let validateFn: ((value: string) => string | undefined) | undefined;
      mockText.mockImplementation(((options: { validate?: (value: string) => string | undefined }) => {
        validateFn = options.validate;
        return Promise.resolve("test.atlassian.net") as Promise<string | symbol>;
      }) as () => Promise<string | symbol>);

      await runSetup();

      expect(validateFn).toBeDefined();
      expect(validateFn!("")).toBe("Jira cloud ID is required");
      expect(validateFn!("invalid.com")).toBe(
        "Should be a valid Atlassian domain (e.g., yourcompany.atlassian.net)"
      );
      expect(validateFn!("mycompany.atlassian.net")).toBeUndefined();
      expect(validateFn!("mycompany.jira.com")).toBeUndefined();
    });

    it("should handle error during save configuration", async () => {
      mockSaveGlobalConfig.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      await runSetup();

      expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Failed to save configuration");
      expect(mockLog.error).toHaveBeenCalledWith("Error: Permission denied");
      expect(mockOutro).toHaveBeenCalledWith("Setup failed.");
    });

    it("should handle error during database initialization", async () => {
      mockInitDatabase.mockImplementation(() => {
        throw new Error("Database error");
      });

      await runSetup();

      expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Failed to save configuration");
      expect(mockLog.error).toHaveBeenCalledWith("Error: Database error");
      expect(mockOutro).toHaveBeenCalledWith("Setup failed.");
    });
  });
});
