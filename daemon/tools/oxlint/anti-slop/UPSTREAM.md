# anti-slop

Vendored from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) `src/` at commit `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-14), MIT licence.

This copy is project policy, maintained here. Local changes are recorded below so a later update can merge upstream fixes without losing them.

## Local changes

| File | Change | Reason |
|---|---|---|
| `rules/require-readable-spacing-cli.test.ts` | Runs `bunx oxlint` in place of `pnpm exec oxlint` | This workspace uses Bun; pnpm refuses to run here |
| `rules/require-readable-spacing-cli.test.ts` | The script body runs inside one Vitest `it` | Vitest runs the vendored tests and requires each file to register a test |
| All plugin and test files | `@oxlint/plugins` imports `vite-plus/lint/plugins`; `oxlint/plugins-dev` imports `vite-plus/lint/plugins-dev`; `vitest` imports `vite-plus/test`. Applied by `vp migrate` (Vite+ 1.3.0), import lines only | Vite+ bundles Oxlint and Vitest, so the plugin always matches the bundled Oxlint version |
| `shared/dictionary-types.ts` | `unsafeMembers[0] ?? null` | This workspace enables `noUncheckedIndexedAccess`; the length check already guarantees the element, so behaviour is unchanged |
