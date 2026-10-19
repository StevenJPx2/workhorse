using Workerd = import "/workerd/workerd.capnp";

# Variant A (TypeScript core). Plain workerd, as the bridge would launch it: Durable Objects on local disk.
const config :Workerd.Config = (
  services = [
    (name = "main", worker = .mainWorker),
    (name = "storage", disk = (writable = true)),
    (name = "internet", network = (allow = ["public", "local"])),
  ],
  sockets = [(name = "http", address = "127.0.0.1:8789", http = (), service = "main")],
);

const mainWorker :Workerd.Worker = (
  compatibilityDate = "2026-10-01",
  modules = [
    (name = "index.js", esModule = embed "dist-ts/index.js"),
  ],
  durableObjectNamespaces = [
    (className = "Mailbox", uniqueKey = "workhorse-spike-mailbox", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "storage"),
  bindings = [
    (name = "MAILBOX", durableObjectNamespace = "Mailbox"),
    (name = "LOADER", workerLoader = ()),
  ],
);
