# `broker`

**Kind:** enforcer, layer 1. **Status:** proposed, not built.

The one network exit for every sandboxed agent. It checks each request against the session's grant, adds secrets the agent never sees, and logs every request.

## Owns

- Forwarding allowed requests, and refusing the rest.
- Adding a secret to a request for a host the grant pairs it with.
- The request log.

## Does not own

- Which hosts and secrets are allowed: that belongs to [`grant`](grant.md).
- MCP tool calls: those belong to [`gateway`](gateway.md).
- Keeping the agent from bypassing it: that belongs to [`sandbox`](sandbox.md).

## Depends on

[`grant`](grant.md). Native.

## Decisions

- **All network traffic goes through the broker** (2026-11-02). It logs every request and adds secrets per host.
- **Secrets over HTTPS** (2026-11-02): clients that accept a base URL, such as model providers, point at the broker's own address. A certificate authority trusted inside the sandbox is the fallback, used only where a base URL cannot change.
- **`git` uses HTTPS through the broker**, which adds the token. SSH is denied until there is a real need (2026-11-02).
- **Never follow a redirect.** Return it to the agent; the follow-up request is checked against the grant like any other.
- **Runs inside the daemon** with the gateway, as a separate crate (2026-11-02).

## Open questions

- Where secrets are stored: the OS keychain is the likely default.
- A request in flight when the broker restarts: report an unknown outcome, never resend.

## Evidence

- Spike 8 on `daemon-v0`: a scripted model behind a broker; only the broker was reachable out of 12 routes.
- [nanocode](../evidence/nanocode.md): credentials added by the host, redirects refused on model requests.
