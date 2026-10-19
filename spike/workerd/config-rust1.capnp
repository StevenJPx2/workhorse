using Workerd = import "/workerd/workerd.capnp";

# Variant C (Rust, one crate). Plain workerd, as the bridge would launch it: Durable Objects on local disk.
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
    (name = "index.js", esModule = embed "dist-rust1/index.js"),
    (name = "spike_core_one_bg.wasm", wasm = embed "dist-rust1/spike_core_one_bg.wasm"),
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
