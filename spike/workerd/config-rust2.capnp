using Workerd = import "/workerd/workerd.capnp";

# Variant B (Rust, two crates). Plain workerd, as the bridge would launch it: Durable Objects on local disk.
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
    (name = "index.js", esModule = embed "dist-rust2/index.js"),
    (name = "spike_core_wasm_bg.wasm", wasm = embed "dist-rust2/spike_core_wasm_bg.wasm"),
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
