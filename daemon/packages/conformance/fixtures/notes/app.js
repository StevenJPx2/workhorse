// The conformance suite's app. Its one public operation reads a note from the root its policy
// names "notes". Whether it may, and whether `path` is valid, the daemon decides.
import { WorkerEntrypoint } from "cloudflare:workers";

export default class Notes extends WorkerEntrypoint {
  invoke(operation, params) {
    if (operation !== "read")
      return { error: { code: -32601, message: `no operation ${operation}` } };

    return this.env.FS.read("notes", params?.path ?? null);
  }
}
