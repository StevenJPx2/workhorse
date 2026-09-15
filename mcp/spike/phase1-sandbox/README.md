# Phase 1 spike: prove the sandbox

Resolves the expensive unknown before any daemon work: can a TypeScript-authored
MCP tool run as a WASM component that reaches the outside world *only* through a
host-granted, scoped capability?

## Result: yes

```text
tool/tool.ts        TypeScript tool — imports one host capability, nothing else
    │ stripTypeScriptTypes → componentize-js
    ▼
build/tool.component.wasm   pure component; imports only wrkhse:spike/host-fs
    │ wasmtime
    ▼
host/               Rust host — implements read-text, scoped to one root
```

The guest has no `node:fs`, no `fetch`, no WASI. Every WASI feature is disabled
at componentize time, so the component's sole import is the host capability.
Filesystem reach is brokered by the host and scoped to a single directory; path
escapes are refused by the host, never by the guest.

## Run the gate

```bash
./run.sh
```

Expected:

```text
run("hello.txt") -> guest read 35 bytes via host capability
try_escape("../secret.txt") -> denied by host: ... escapes the granted root
PASS: capability brokered, escape denied, no ambient access
```

## What this settles for the daemon design

- TypeScript authoring compiles to a real sandboxed component; handlers cannot
  import ambient host modules.
- A capability is a WIT import the host implements and scopes per call.
- The daemon becomes the trust boundary: it grants narrow capabilities and
  validates every invocation, exactly as `docs/architecture.md` describes.

## Toolchain

- Rust host: `wasmtime` 48 (component model)
- Componentizer: `@bytecodealliance/componentize-js` 0.22
- `wasm-tools` for import inspection
