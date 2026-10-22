using Workerd = import "/workerd/workerd.capnp";

# The laptop: dials home on 8442, pinning home's self-signed certificate for peer.workhorse.
const config :Workerd.Config = (
  services = [
    (name = "main", worker = .w),
    (name = "peer", external = (address = "127.0.0.1:8442", https = (
      tlsOptions = (trustedCertificates = [embed "home-cert.pem"]),
      certificateHost = "peer.workhorse"))),
  ],
  sockets = [
    (name = "http", address = "127.0.0.1:9101", http = (), service = "main"),
    (name = "link", address = "127.0.0.1:8441", https = (
      tlsOptions = (keypair = (privateKey = embed "laptop-key.pem", certificateChain = embed "laptop-cert.pem"))),
      service = "main"),
  ],
);

const w :Workerd.Worker = (
  compatibilityDate = "2026-10-01",
  modules = [(name = "link.js", esModule = embed "link.js")],
  durableObjectNamespaces = [(className = "Link", uniqueKey = "link-laptop", preventEviction = true)],
  durableObjectStorage = (inMemory = void),
  bindings = [
    (name = "LINK", durableObjectNamespace = "Link"),
    (name = "PEER", service = "peer"),
    (name = "ROLE", text = "laptop"),
  ],
);
