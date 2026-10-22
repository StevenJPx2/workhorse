# Link

The contract for links between daemons: the handshake messages, the bytes each side signs, how a message from a peer is classified, and the timing both sides must agree on. A link is a WebSocket over TLS carrying JSON-RPC 2.0, one message per WebSocket text message, in both directions. The daemon's `Link` Durable Object (`packages/worker`) holds it; `core` decides who may do what.

## Contents

| Module                 | Export                                                                                          | Responsibility                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `handshake.ts`         | `Nonce`, `Signature`                                                                            | 32 random bytes and an Ed25519 signature, as unpadded base64url     |
| `handshake.ts`         | `LinkHelloParams`, `LinkHelloResult`, `LinkProveParams`                                         | The three handshake payloads                                        |
| `transcript.ts`        | `linkTranscript`, `LinkRole`, `LinkSide`                                                        | The exact bytes a side signs                                        |
| `read-link-message.ts` | `readLinkMessage`, `LinkMessage`                                                                | Classifies one message: request, notification, response, or invalid |
| `limits.ts`            | `HEARTBEAT_MS`, `SILENCE_LIMIT_MS`, `DIAL_DEADLINE_MS`, `CALL_DEADLINE_MS`, `REDIAL_BACKOFF_MS` | Timing both sides share                                             |
| `index.ts`             | barrel                                                                                          | The folder's public API                                             |

## Handshake

```mermaid
sequenceDiagram
    participant D as Dialer
    participant A as Acceptor
    D->>A: TLS to A's pinned certificate, name daemon.workhorse; WebSocket upgrade
    D->>A: link.hello { protocol, key: Kd, nonce: Nd }
    Note over A: Kd must be a peer's key
    A-->>D: { protocol, key: Ka, nonce: Na, signature: sign(Ka, transcript("acceptor")) }
    Note over D: Ka must equal the peer's key; verify the signature
    D->>A: link.prove { signature: sign(Kd, transcript("dialer")) }
    Note over A: verify the signature
    A-->>D: {}
    Note over D,A: ready: calls both ways, link.ping every 5 s
```

`transcript(signer)` is the UTF-8 text of these lines joined by `\n`:

| Line | Value                  |
| ---- | ---------------------- |
| 1    | `workhorse-link-v1`    |
| 2    | `dialer` or `acceptor` |
| 3    | the dialer's key       |
| 4    | the acceptor's key     |
| 5    | the dialer's nonce     |
| 6    | the acceptor's nonce   |

- **Role:** the signer's role is signed, so one side's signature can never stand for the other's.
- **Freshness:** both nonces are fresh per link, so a recorded handshake cannot be replayed.
- **Unambiguous:** every field has a fixed length and alphabet, so joining with `\n` cannot blur fields.
- **Before the handshake:** a call is refused before `link.prove` succeeds; a peer is authenticated but still untrusted input.

## Timing

| Constant            | Value                        | Why                                                                           |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `HEARTBEAT_MS`      | 5 s                          | Each side sends `link.ping`; any message counts as a sign of life             |
| `SILENCE_LIMIT_MS`  | 15 s                         | Three missed heartbeats drop the link; TCP alone may report nothing (spike 6) |
| `DIAL_DEADLINE_MS`  | 5 s                          | A peer that accepts TCP but never finishes TLS stalls a dial (spike 6)        |
| `CALL_DEADLINE_MS`  | 10 s                         | A call with no answer by then returns `unavailable`                           |
| `REDIAL_BACKOFF_MS` | 100, 250, 500, 1000, 2000 ms | Waits between failed dials; the last repeats                                  |

## Usage

```ts
import { linkTranscript, readLinkMessage } from "@workhorse/protocol";

const bytes = linkTranscript("acceptor", { key: dialerKey, nonce: dialerNonce }, { key, nonce });
const signature = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, bytes);

const message = readLinkMessage(event.data);

if (message.type === "response") {
  // Settle the pending call with message.id.
}
```
