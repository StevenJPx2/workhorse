---
"workhorse": minor
"workhorse-core": minor
---

Rename project from jiratown to workhorse

- All packages renamed to unscoped `workhorse-*` names
- Public API types renamed: `JiratownConfig` → `WorkhorseConfig`, `JiratownContext` → `WorkhorseContext`, etc.
- CLI binary renamed from `jiratown` to `workhorse`
- Config file paths updated to `~/.workhorse.toml`
