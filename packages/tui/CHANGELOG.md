# @fdcn/workhorse

## 0.1.5

### Patch Changes

- Bump version to include workhorse-core fix for default harness name

## 0.1.1

### Patch Changes

- Fix publish configuration: clean dist before build, exclude sourcemaps from tarball, and correct CI release workflow

## 0.1.0

### Minor Changes

- [`9822fa3`](https://github.com/StevenJPx2/workhorse/commit/9822fa3f93306fe34acd4c1eac170545ff1e4335) Thanks [@StevenJPx2](https://github.com/StevenJPx2)! - Rename project from jiratown to workhorse
  - All packages renamed to unscoped `workhorse-*` names
  - Public API types renamed: `JiratownConfig` → `WorkhorseConfig`, `JiratownContext` → `WorkhorseContext`, etc.
  - CLI binary renamed from `jiratown` to `workhorse`
  - Config file paths updated to `~/.workhorse.toml`

### Patch Changes

- Updated dependencies [[`9822fa3`](https://github.com/StevenJPx2/workhorse/commit/9822fa3f93306fe34acd4c1eac170545ff1e4335)]:
  - workhorse-core@0.1.0

## 0.1.0

### Minor Changes

- [`e3b529c`](https://github.com/StevenJPx2/workhorse/commit/e3b529ce817dd013585ee18a732be42f3de6945b) Thanks [@StevenJPx2](https://github.com/StevenJPx2)! - Completely refactored jiratown core library to be runtime-agnostic. Packages are now published under the `@stevenjpx2` scope on GitHub Packages (`workhorse-core`, `@stevenjpx2/jiratown-tui`).

### Patch Changes

- Updated dependencies [[`e3b529c`](https://github.com/StevenJPx2/workhorse/commit/e3b529ce817dd013585ee18a732be42f3de6945b)]:
  - workhorse-core@0.1.0

## 0.1.0

### Minor Changes

- [#1](https://github.com/StevenJPx2/workhorse/pull/1) [`df7b41e`](https://github.com/StevenJPx2/workhorse/commit/df7b41ee2469536d1d4727ad6ad4469bcf9f8c2a) Thanks [@StevenJPx2](https://github.com/StevenJPx2)! - Completely refactored jiratown core library to be runtime-agnostic.

### Patch Changes

- Updated dependencies [[`df7b41e`](https://github.com/StevenJPx2/workhorse/commit/df7b41ee2469536d1d4727ad6ad4469bcf9f8c2a)]:
  - workhorse-core@0.1.0
