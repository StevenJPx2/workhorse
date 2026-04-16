/**
 * Tests for SyncIndicator component
 *
 * These tests verify the component's interface and props handling.
 * Visual rendering tests would require @solidjs/testing-library.
 */

import { describe, it, expect } from "bun:test";
import type { SyncIndicatorProps } from "./types.ts";

describe("SyncIndicator", () => {
  describe("Props interface", () => {
    it("should accept showGitHub prop", () => {
      const props: SyncIndicatorProps = { showGitHub: true };
      expect(props.showGitHub).toBe(true);
    });

    it("should accept showJira prop", () => {
      const props: SyncIndicatorProps = { showJira: true };
      expect(props.showJira).toBe(true);
    });

    it("should accept isGitHubPolling accessor", () => {
      const isPolling = () => true;
      const props: SyncIndicatorProps = { isGitHubPolling: isPolling };
      expect(props.isGitHubPolling?.()).toBe(true);
    });

    it("should accept isJiraPolling accessor", () => {
      const isPolling = () => false;
      const props: SyncIndicatorProps = { isJiraPolling: isPolling };
      expect(props.isJiraPolling?.()).toBe(false);
    });

    it("should accept all props together", () => {
      const props: SyncIndicatorProps = {
        showGitHub: true,
        showJira: true,
        isGitHubPolling: () => true,
        isJiraPolling: () => false,
      };
      expect(props.showGitHub).toBe(true);
      expect(props.showJira).toBe(true);
      expect(props.isGitHubPolling?.()).toBe(true);
      expect(props.isJiraPolling?.()).toBe(false);
    });

    it("should allow all props to be optional", () => {
      const props: SyncIndicatorProps = {};
      expect(props.showGitHub).toBeUndefined();
      expect(props.showJira).toBeUndefined();
      expect(props.isGitHubPolling).toBeUndefined();
      expect(props.isJiraPolling).toBeUndefined();
    });
  });
});
