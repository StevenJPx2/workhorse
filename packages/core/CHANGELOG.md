# workhorse-core

## 0.1.1

### Patch Changes

- Fix default harness name mismatch causing "No adapter registered" error

  The default harness in config was set to `"pi-agent"` but the pi-adapter plugin registers as `"pi-coding-agent"`. This caused errors when spawning agents from the chat box input (which uses the default harness) while the spawn modal worked correctly (it explicitly passes the registered harness name).

  Updated the default harness name to `"pi-coding-agent"` in:
  - Default config (`DEFAULT_CONFIG.agent.harness`)
  - Zod schema default
  - Documentation

## 0.1.0

### Minor Changes

- [`9822fa3`](https://github.com/StevenJPx2/workhorse/commit/9822fa3f93306fe34acd4c1eac170545ff1e4335) Thanks [@StevenJPx2](https://github.com/StevenJPx2)! - Rename project from jiratown to workhorse
  - All packages renamed to unscoped `workhorse-*` names
  - Public API types renamed: `JiratownConfig` → `WorkhorseConfig`, `JiratownContext` → `WorkhorseContext`, etc.
  - CLI binary renamed from `jiratown` to `workhorse`
  - Config file paths updated to `~/.workhorse.toml`

## 0.1.0

### Minor Changes

- [`e3b529c`](https://github.com/StevenJPx2/workhorse/commit/e3b529ce817dd013585ee18a732be42f3de6945b) Thanks [@StevenJPx2](https://github.com/StevenJPx2)! - Completely refactored jiratown core library to be runtime-agnostic. Packages are now published under the `@stevenjpx2` scope on GitHub Packages (`workhorse-core`, `@stevenjpx2/jiratown-tui`).

## 0.1.0

### Minor Changes

- [#1](https://github.com/StevenJPx2/workhorse/pull/1) [`df7b41e`](https://github.com/StevenJPx2/workhorse/commit/df7b41ee2469536d1d4727ad6ad4469bcf9f8c2a) Thanks [@StevenJPx2](https://github.com/StevenJPx2)! - Completely refactored jiratown core library to be runtime-agnostic.
