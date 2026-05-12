# Jiratown TODOs

## Agent Harness Installation

- [ ] **Add install command for missing agent harnesses**
  
  When a user configures an agent harness (e.g., `pi-agent`) but the corresponding CLI tool isn't installed on their system, jiratown should:
  
  1. Detect that the harness CLI is missing (e.g., `pi` command not found)
  2. Prompt the user to install it, or provide an install command
  3. For Pi: `npm install -g @mariozechner/pi-coding-agent`
  
  This is particularly important for OAuth authentication flows that require the CLI's `/login` command.
  
  **Considerations:**
  - Should this be a `jiratown install-harness <name>` command?
  - Or automatic detection on first run with interactive prompt?
  - Support for different package managers (npm, pnpm, yarn, bun)
  - Version pinning/compatibility checks between jiratown and harness versions
