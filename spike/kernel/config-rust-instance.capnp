using Workerd = import "/workerd/workerd.capnp";

# Variant RI: Rust kernel, one wasm instance per Durable Object. Durable Objects on local disk, as in spike 3.
const config :Workerd.Config = (
  services = [
    (name = "main", worker = .mainWorker),
    (name = "storage", disk = (writable = true)),
  ],
  sockets = [(name = "http", address = "127.0.0.1:8789", http = (), service = "main")],
);

const mainWorker :Workerd.Worker = (
  compatibilityDate = "2026-10-01",
  modules = [
    (name = "index.js", esModule = embed "dist-rust-instance/index.js"),
    (name = "kernel.wasm", wasm = embed "dist-rust-instance/kernel.wasm"),
  ],
  durableObjectNamespaces = [
    (className = "Mailbox", uniqueKey = "workhorse-spike-kernel", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "storage"),
  bindings = [(name = "MAILBOX", durableObjectNamespace = "Mailbox")],
);
