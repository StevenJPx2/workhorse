// The link tests' second app, served by the other daemon of a pair. Its one public operation
// reads an entry from the root its policy names "journal".
import { WorkerEntrypoint } from "cloudflare:workers";

export default class Journal extends WorkerEntrypoint {
  invoke(operation, params) {
    if (operation !== "read")
      return { error: { code: -32601, message: `no operation ${operation}` } };

    return this.env.FS.read("journal", params?.path ?? null);
  }
}
