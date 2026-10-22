using Workerd = import "/workerd/workerd.capnp";

# Home: accepts the link on 8442 with its self-signed certificate; never dials.
const config :Workerd.Config = (
  services = [
    (name = "main", worker = .w),
    (name = "peer", external = (address = "127.0.0.1:8441", https = (
      tlsOptions = (trustedCertificates = [embed "laptop-cert.pem"]),
      certificateHost = "peer.workhorse"))),
  ],
  sockets = [
    (name = "http", address = "127.0.0.1:9102", http = (), service = "main"),
    (name = "link", address = "127.0.0.1:8442", https = (
      tlsOptions = (keypair = (privateKey = embed "home-key.pem", certificateChain = embed "home-cert.pem"))),
      service = "main"),
  ],
);

const w :Workerd.Worker = (
  compatibilityDate = "2026-10-01",
  modules = [(name = "link.js", esModule = embed "link.js")],
  durableObjectNamespaces = [(className = "Link", uniqueKey = "link-home", preventEviction = true)],
  durableObjectStorage = (inMemory = void),
  bindings = [
    (name = "LINK", durableObjectNamespace = "Link"),
    (name = "PEER", service = "peer"),
    (name = "ROLE", text = "home"),
  ],
);
