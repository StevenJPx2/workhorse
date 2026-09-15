# M5 spike: @cloudflare/computer (2026-08-13, v0.2.0)

Question: can Computer's Workspace (durable VFS in a DO + pluggable exec
backends) replace Workhorse's container-first sandbox?

## What was proven live (worker `spike-computer`, deployed)

- **Durable VFS in a DO — WORKS.** `PUT /fs?name=m5&path=/notes.md` wrote to
  the DO's SQLite; `GET /fs` read it back with correct metadata (size, mtime,
  isFile). This is the workspace state model the fleet would want: the
  ticket's files live in the DO, not in an ephemeral container disk.
- **Isolate shell (just-bash via Worker Loader) — CANNOT DEPLOY.** The
  `experimental` compat flag is required by the worker-shell/worker-javascript
  backends and Cloudflare **rejects it on deployed Workers** (API error
  10021). Local-only today → useless for a fleet that runs in production.
- **Container backend (computerd + FUSE)** deploys with plain `nodejs_compat`
  and is exactly the sanctioned container↔DO attachment Phase 7 blocker #1
  wanted — but its image (prebuilt computerd linux-x64) is a PRIVATE Cloudflare
  artifact; the example's build hook stages it from an internal registry. Not
  buildable by us today.
- **workspace.git — blocked on preview API friction.** `createGitClient()`
  returned a factory (the docs' example shape) but the DO-side RPC receiver
  did not implement `clone` ("The RPC receiver does not implement the method
  clone"). Preview-quality wiring; not worth chasing at 0.2.0.

## Verdict

**Do NOT adopt.** The package is self-described "NOT suitable for production";
the cheap backends cannot be deployed at all on this account; the container
backend's image is private; the git surface is broken in 0.2.0. The fleet's
container-first sandbox stays the runtime. The one validated idea — ticket
workspace state as DO SQLite with a filesystem RPC surface — is already how
the fleet's durable state works (D1/KV); a container that FUSE-mounts a
workspace is the Phase 7 v2 shape if/when Computer exits preview or publishes
the computerd image publicly.

## Revisit triggers

- `@cloudflare/computer` ≥ 0.4 (or stable) AND the computerd image public OR
  the `experimental` flag deployable → re-run this spike's /exec + /git
  surfaces, then compare one real ticket run (clone → edit → test) against
  the container sandbox.
