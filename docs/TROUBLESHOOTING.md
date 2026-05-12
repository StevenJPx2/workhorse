# Jiratown Troubleshooting Guide

This guide helps diagnose and resolve common issues with Jiratown.

## Table of Contents

1. [Setup Issues](#setup-issues)
2. [Agent Issues](#agent-issues)
3. [Jira Integration](#jira-integration)
4. [GitHub Integration](#github-integration)
5. [Database Issues](#database-issues)
6. [Plugin Issues](#plugin-issues)
7. [Steering Issues](#steering-issues)
8. [Performance Issues](#performance-issues)

---

## Setup Issues

### "Jira cloud ID is not configured"

**Cause:** The Jira cloud ID is missing from configuration.

**Solution:**
1. Run `jiratown setup` to configure your Jira instance
2. Or manually add to your config:

```toml
# ~/.jiratown/config.toml
[jira]
cloud_id = "yourcompany.atlassian.net"
```

### Dependencies Not Found

**Cause:** Required dependencies are not installed.

**Solution:** Ensure these are available:
- `bun` - Runtime (v1.3+)
- `git` - Version control
- `tmux` - Terminal multiplexer (for agents)
- `npx` - For MCP remote connections

```bash
# Check dependencies
which bun git tmux npx

# Install tmux (macOS)
brew install tmux

# Install tmux (Ubuntu/Debian)
sudo apt install tmux
```

### Config Not Loading

**Cause:** TOML syntax error or missing file.

**Solution:**
1. Verify config file exists:
   ```bash
   cat ~/.jiratown/config.toml
   ```
2. Validate TOML syntax at https://www.toml-lint.com/
3. Check for common issues:
   - Unclosed quotes
   - Invalid table headers
   - Incorrect indentation

---

## Agent Issues

### Agent Not Starting

**Symptoms:** Agent spawn fails silently or shows "crashed" state.

**Possible causes and solutions:**

1. **Pi Coding Agent not authenticated:**
   ```bash
   pi /login
   ```

2. **tmux session conflict:**
   ```bash
   # List tmux sessions
   tmux ls
   
   # Kill stale session
   tmux kill-session -t jt-PROJ-123
   ```

3. **Worktree already exists:**
   ```bash
   # Check worktrees
   git worktree list
   
   # Remove stale worktree
   git worktree remove /path/to/worktree --force
   ```

4. **Model not available:**
   - Check model registry in orchestrator
   - Verify provider authentication

### Agent Stuck in "starting" State

**Cause:** Agent initialization is blocking.

**Solution:**
1. Check tmux session output:
   ```bash
   tmux capture-pane -t jt-PROJ-123 -p
   ```
2. Check for errors in agent logs
3. Verify MCP config was written correctly:
   ```bash
   cat /path/to/worktree/.opencode/opencode.json
   ```

### Agent Not Receiving Messages

**Cause:** Notification or steering hook not connected.

**Solution:**
1. Verify hooks are registered:
   ```typescript
   hooks.on("notification.created", (e) => console.log(e));
   ```
2. Check if agent is in correct state (should be "running")
3. Verify `sendMessage` is implemented in adapter

### Agent Health Check Failing

**Cause:** tmux session died or OpenCode SDK not responding.

**Solution:**
1. Check tmux session:
   ```bash
   tmux has-session -t jt-PROJ-123 && echo "exists"
   ```
2. Check OpenCode SDK status:
   ```bash
   curl http://localhost:PORT/health
   ```
3. Restart agent:
   ```typescript
   await orchestrator.getAgent(issueId)?.stop();
   await orchestrator.spawn({ ... });
   ```

---

## Jira Integration

### "Failed to parse Jira response"

**Cause:** MCP returned unexpected data.

**Possible solutions:**
1. Verify issue exists in Jira
2. Check cloud ID is correct
3. Verify Jira authentication is valid
4. Check network connectivity

### Authentication Failed

**Cause:** OAuth tokens expired or invalid.

**Solution:**
1. Re-authenticate with Atlassian:
   ```bash
   npx -y mcp-remote https://mcp.atlassian.com/v1/mcp
   ```
2. Complete browser OAuth flow
3. Retry operation

### Comments Not Syncing

**Cause:** Jira comment monitor not running.

**Solution:**
1. Check monitor status:
   ```typescript
   const running = monitors.getRunningMonitors(issueId);
   console.log(running);
   ```
2. Verify poll interval isn't too long
3. Check for monitor errors:
   ```typescript
   hooks.on("monitor.error", console.error);
   ```

### Status Transitions Failing

**Cause:** Target status not available in Jira workflow.

**Solution:**
1. Check available transitions:
   ```typescript
   const transitions = await jiraClient.getTransitions("PROJ-123");
   console.log(transitions);
   ```
2. Map Jiratown status to correct Jira transition name
3. Verify user has permission to perform transition

---

## GitHub Integration

### PR Monitor Not Detecting Changes

**Cause:** GitHub API rate limiting or auth issues.

**Solution:**
1. Check `gh` CLI is authenticated:
   ```bash
   gh auth status
   ```
2. Verify PR exists and is accessible
3. Check monitor is started:
   ```typescript
   monitors.startMonitor("github-pr", issueId);
   ```

### `github_open_pr` Failing

**Cause:** Branch not pushed or permissions issue.

**Solution:**
1. Ensure changes are committed and pushed:
   ```bash
   cd /path/to/worktree
   git log --oneline -5
   git push origin HEAD
   ```
2. Check `gh` has repo permissions
3. Verify base branch exists

### CI Status Not Updating

**Cause:** Check runs not completed or monitor not polling.

**Solution:**
1. Wait for CI to complete
2. Force poll:
   ```typescript
   await monitors.pollNow("github-pr", issueId);
   ```
3. Check GitHub API for check run status

---

## Database Issues

### "Database is locked"

**Cause:** Multiple processes accessing SQLite.

**Solution:**
1. Check for other Jiratown processes:
   ```bash
   ps aux | grep jiratown
   ```
2. Kill stale processes
3. Remove lock file if present:
   ```bash
   rm ~/.jiratown/jiratown.db-wal
   rm ~/.jiratown/jiratown.db-shm
   ```

### Migration Failed

**Cause:** Schema incompatibility or corrupt database.

**Solution:**
1. Backup current database:
   ```bash
   cp ~/.jiratown/jiratown.db ~/.jiratown/jiratown.db.bak
   ```
2. Try re-running migrations
3. If all else fails, delete and recreate:
   ```bash
   rm ~/.jiratown/jiratown.db
   jiratown setup
   ```

### Data Not Persisting

**Cause:** In-memory database or incorrect path.

**Solution:**
1. Verify database path:
   ```typescript
   const paths = resolveConfigPaths();
   console.log(paths.database);
   ```
2. Ensure not using `:memory:`
3. Check write permissions on directory

---

## Plugin Issues

### Plugin Not Loading

**Cause:** Plugin registration or discovery failed.

**Solution:**
1. Check plugin is registered:
   ```typescript
   const jt = await bootstrap({
     plugins: [myPlugin],
   });
   console.log(jt.plugins.has("my-plugin"));
   ```
2. Check for `plugin.error` events:
   ```typescript
   hooks.on("plugin.error", console.error);
   ```
3. Verify plugin exports are correct

### Config Validation Failing

**Cause:** Plugin config doesn't match schema.

**Solution:**
1. Check config in TOML:
   ```toml
   [plugins.my-plugin]
   api_key = "..."  # snake_case in TOML
   ```
2. Verify schema matches expected fields
3. Check Zod error messages for details

### Tools Not Registered

**Cause:** Plugin setup didn't run or tool wasn't registered.

**Solution:**
1. Verify `orchestrator.registerTool()` is called in setup
2. Check tool appears in tools list:
   ```typescript
   console.log(orchestrator.getTools().map(t => t.name));
   ```
3. Ensure plugin setup completed without errors

### Parser Not Matching

**Cause:** `canParse()` returning false or wrong priority.

**Solution:**
1. Test parser directly:
   ```typescript
   const parser = tracker.getParser("my-source");
   console.log(parser.canParse("MY-123"));
   ```
2. Check registration order (first match wins)
3. Debug `canParse` logic

---

## Steering Issues

### Rules Never Firing

**Possible causes:**

1. **`once: true` already fired:**
   - Rule only fires once per session
   - Restart agent to reset

2. **Cooldown active:**
   - Wait for `cooldownMs` to pass
   - Default is 30 seconds

3. **Issue is blocked:**
   - Steering never reminds blocked agents
   - Check issue status

4. **Conditions not met:**
   - Verify status filter includes current status
   - Check if required hooks have fired
   - Debug `when()` function

### Rules Firing Too Often

**Solution:**
1. Increase `cooldownMs`:
   ```toml
   [steering]
   cooldown_ms = 60000
   ```
2. Set `once: true` for one-time reminders
3. Add more restrictive conditions

### Wrong Reminder Content

**Cause:** Dynamic reminder function returning incorrect content.

**Solution:**
1. Debug reminder function:
   ```typescript
   reminder: async (ctx) => {
     console.log("Context:", ctx);
     return "...";
   }
   ```
2. Check `ctx.notifications` and `ctx.toolHistory`
3. Verify issue data is correct

---

## Performance Issues

### Slow Startup

**Causes:**
- Large database
- Many plugins loading
- Network timeouts on MCP connections

**Solutions:**
1. Clean up old issues:
   ```typescript
   await tracker.deleteIssue(oldIssueId);
   ```
2. Disable unused plugins:
   ```toml
   [plugins]
   disabled = ["plugin-name"]
   ```
3. Use local caching for external data

### High Memory Usage

**Causes:**
- Many agents running
- Large L2 memory store
- Event listener leaks

**Solutions:**
1. Limit concurrent agents
2. Prune L2 memory periodically
3. Check for orphaned event listeners:
   ```typescript
   onCleanup(() => hooks.off("event", handler));
   ```

### Monitor Polling Too Frequent

**Solution:**
1. Increase poll intervals:
   ```toml
   [plugins.jira]
   poll_interval = 60000
   
   [plugins.github]
   poll_interval = 60000
   ```
2. Use longer intervals for stable issues

---

## Debug Logging

### Enable Verbose Logging

```typescript
// In plugin setup
hooks.on("*", (type, event) => {
  console.log(`[${type}]`, event);
});
```

### Monitor Specific Events

```typescript
// Agent lifecycle
hooks.on("agent.create.post", (e) => console.log("Agent created:", e));
hooks.on("agent.start.post", (e) => console.log("Agent started:", e));
hooks.on("agent.stop.post", (e) => console.log("Agent stopped:", e));

// Issues
hooks.on("issue.status_changed", (e) => console.log("Status:", e.from, "→", e.to));

// Steering
hooks.on("steering.reminder", (e) => console.log("Reminder:", e.reminder));

// Errors
hooks.on("plugin.error", (e) => console.error("Plugin error:", e));
hooks.on("monitor.error", (e) => console.error("Monitor error:", e));
```

### Inspect Database

```bash
# Open SQLite CLI
sqlite3 ~/.jiratown/jiratown.db

# List tables
.tables

# Query issues
SELECT id, external_id, status FROM issues;

# Query notifications
SELECT id, title, status FROM notifications WHERE status = 'unread';

# Exit
.quit
```

---

## Getting Help

If you're still stuck:

1. Check existing issues on GitHub
2. Search documentation in `docs/` directory
3. Review source code for implementation details
4. File a new issue with:
   - Steps to reproduce
   - Error messages
   - Config (redacted)
   - Environment info (OS, Bun version, etc.)
