# Workhorse

**Controllable autonomous coding agents.** A Cloudflare-native fleet
orchestrator: file a ticket, an agent plans and implements it autonomously
in an isolated cloud sandbox, using a small model kept capable by giving it
the right tools and context at each workflow stage.

## Architecture

| Plane | Runs on | What |
|---|---|---|
| Spine | Cloudflare Workflows | one durable instance per ticket (plan → implement → …) |
| Muscle | Cloudflare Sandbox | per-ticket Firecracker container; clone/build/test |
| Brain | Anthropic (Claude subscription OAuth) | Pi agent, baked into the sandbox image |
| Token custody | MacBook homelab server | holds+refreshes the OAuth refresh token; mints short-lived access tokens |
| Face | NuxtHub (planned) | fleet UI, embedded in Glance |

## API (bearer-gated)

```
POST /tickets  {title?, repo, prompt, accessToken}  → durable run
GET  /tickets                                       → fleet list
GET  /tickets/:id                                   → record + live workflow status
```

## Dev

```
bun install
bun run dev       # local (needs Docker for the sandbox container)
bun run deploy    # deploy Worker + container image
```

Secrets: `SPIKE_TOKEN` (API bearer). Dev value in `.dev.vars` (git-ignored).

Legacy Workhorse (TS core, core-v2/v3, Rust orchestrator) lives on the
`legacy` branch.
