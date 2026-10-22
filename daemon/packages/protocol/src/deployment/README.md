# Deployment

The contract between `workhorse install` and the daemon, and between the daemon and its apps. The CLI builds a `Deployment` from the user's policy and the apps' manifests; the daemon decodes it at startup and loads each app as a Dynamic Worker. Both sides are generated or loaded separately, so these schemas are a contract like the wire protocol.

## Schemas and functions

| Module            | Export          | Responsibility                                                                                        |
| ----------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `app-manifest.ts` | `OperationName` | A public operation's name: lower camel case, up to 63 characters.                                     |
| `app-manifest.ts` | `AppManifest`   | An app's `manifest.json`: its name and public operations.                                             |
| `app-manifest.ts` | `AppSpec`       | A manifest plus the app's bundled ES module `source`, as the daemon loads it.                         |
| `deployment.ts`   | `Deployment`    | The user's `Policy` and the `AppSpec`s to load.                                                       |
| `outcome.ts`      | `Outcome`       | What an app operation or a capability call returns: a `result` or an `error`. Decoded, never trusted. |
| `root-binding.ts` | `rootBinding`   | The workerd binding name of one granted root's disk directory: `fs:<app>:<root>`.                     |
| `index.ts`        | barrel          | The folder's public API.                                                                              |

## Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI as workhorse install
    participant Config as workerd config
    participant Daemon as worker (daemon)
    participant App as App (Dynamic Worker)
    User->>CLI: policy + app folders
    CLI->>CLI: decode Policy and each manifest.json; read each app.js
    CLI->>Config: Deployment JSON + disk directory per rootBinding(app, root)
    Config->>Daemon: DEPLOYMENT binding
    Daemon->>Daemon: decode Deployment on each connection
    Daemon->>App: load AppSpec.source
    App-->>Daemon: Outcome (decoded)
```

- **Names:** app and root names cannot contain `:`, so `rootBinding` is unambiguous. The policy alone knows a root's real folder; app code uses only its name.
- **Untrusted apps:** the daemon decodes every `Outcome`. An app that returns anything else produces a `failed` reply with reason `invalid_app_outcome`, not a crash.
- **Invalid deployment:** if `DEPLOYMENT` does not decode, the daemon refuses each connection with `failed: invalid deployment`.
- **Policy:** the `Policy`, `AppName` and `RootName` schemas live in `../policy.ts`; see [Policy and leases](../../../../docs/architecture.md#policy-and-leases).

## Usage

```ts
import { Deployment, rootBinding } from "@workhorse/protocol";
import { Schema } from "effect";

const deployment = Schema.decodeUnknownSync(Deployment)({
  policy: { apps: { notes: { fs: { roots: { notes: "/home/me/notes" }, mode: "read" } } } },
  apps: [{ name: "notes", operations: ["read"], source: "export default {}" }],
});

rootBinding("notes", "notes"); // "fs:notes:notes"
```
