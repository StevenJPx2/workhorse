# @fdcn/workhorse

## v0.1.16

[compare changes](https://github.com/StevenJPx2/workhorse/compare/v0.1.15...v0.1.16)

### 🩹 Fixes

- Build issues with web ([475ad03](https://github.com/StevenJPx2/workhorse/commit/475ad03))

### ❤️ Contributors

- Steven John <stevenjpx2@gmail.com>

## v0.1.15

[compare changes](https://github.com/StevenJPx2/workhorse/compare/v0.1.14...v0.1.15)

### 🚀 Enhancements

- **skills:** Implement plugin skills system with on-demand loading ([249858d](https://github.com/StevenJPx2/workhorse/commit/249858d))
- **plugins:** Add web plugin wrapping jina-cli for web operations ([e4467f0](https://github.com/StevenJPx2/workhorse/commit/e4467f0))
- **tui:** Add web plugin to default plugin list ([32afcf6](https://github.com/StevenJPx2/workhorse/commit/32afcf6))

### 🩹 Fixes

- **tests:** Fix skill test assertion and tui vitest solid-js path ([a1e25e0](https://github.com/StevenJPx2/workhorse/commit/a1e25e0))
- **release:** Localize release to tui ([96fc4e9](https://github.com/StevenJPx2/workhorse/commit/96fc4e9))

### 📖 Documentation

- Add skills section to plugin guide ([3aa040a](https://github.com/StevenJPx2/workhorse/commit/3aa040a))

### 🏡 Chore

- **ci:** Use provenance ([73d9451](https://github.com/StevenJPx2/workhorse/commit/73d9451))
- Bun lock ([535311d](https://github.com/StevenJPx2/workhorse/commit/535311d))
- Bump version ([8ee50f2](https://github.com/StevenJPx2/workhorse/commit/8ee50f2))

### ❤️ Contributors

- Steven John <stevenjpx2@gmail.com>

## v0.1.14

[compare changes](https://github.com/StevenJPx2/workhorse/compare/v0.1.13...v0.1.14)

### 🚀 Enhancements

- Add core to main ([7d7576a](https://github.com/StevenJPx2/workhorse/commit/7d7576a))

### 🩹 Fixes

- Visual bugs ([c434704](https://github.com/StevenJPx2/workhorse/commit/c434704))

### ❤️ Contributors

- Steven John <stevenjpx2@gmail.com>

## v0.1.13

[compare changes](https://github.com/StevenJPx2/workhorse/compare/v0.1.1...v0.1.13)

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
