---
"@jiratown/core": minor
"@jiratown/tui": patch
---

Make keychain runtime-agnostic

- Replace Bun shell with Node's `child_process.execFile` for macOS keychain operations
- The keychain module now works in Node, Bun, Deno, and any Node-compatible runtime
- No external dependencies required for credential management
