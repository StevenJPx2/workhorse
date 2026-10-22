import { describe, expect, it } from "vite-plus/test";
import { COMPATIBILITY_DATE } from "@workhorse/protocol";
import { diskRoots, linkConfig, renderConfig } from "../src/config.ts";
import { layoutOf } from "../src/layout.ts";

const layout = layoutOf("/home/me/.workhorse");

describe("diskRoots", () => {
  it("gives each granted root its own disk directory, writable only for read-write grants", () => {
    expect(
      diskRoots({
        apps: {
          notes: {
            fs: { roots: { notes: "/home/me/notes", drafts: "/home/me/drafts" }, mode: "read" },
          },
          skills: { fs: { roots: { skills: "/home/me/skills" }, mode: "read-write" } },
          quiet: {},
        },
      }),
    ).toEqual([
      { binding: "fs:notes:notes", path: "/home/me/notes", writable: false },
      { binding: "fs:notes:drafts", path: "/home/me/drafts", writable: false },
      { binding: "fs:skills:skills", path: "/home/me/skills", writable: true },
    ]);
  });
});

const certificate = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n";

describe("linkConfig", () => {
  it("dials only the peers the policy gives an address", () => {
    const key = `${"k".repeat(42)}A`;

    expect(
      linkConfig(
        {
          apps: {},
          peers: {
            home: { key, certificate, address: "100.104.65.112:7841", operations: [] },
            phone: { key, certificate, operations: ["notes.read"] },
          },
        },
        "0.0.0.0:7841",
      ),
    ).toEqual({
      listen: "0.0.0.0:7841",
      dialed: [{ name: "home", address: "100.104.65.112:7841", certificate }],
    });
  });
});

describe("renderConfig", () => {
  const config = renderConfig(
    layout,
    [{ binding: "fs:notes:notes", path: "/home/me/notes", writable: false }],
    { listen: undefined, dialed: [] },
  );

  it("serves raw connections on the daemon's Unix socket, and listens for links only when asked", () => {
    expect(config).toContain(
      '(name = "main", address = "unix:/home/me/.workhorse/sock/daemon.sock", tcp = (), service = "daemon")',
    );
    expect(config).not.toContain('name = "link"');
  });

  it("keeps each Link object in memory for good, and binds the identity", () => {
    expect(config).toContain(
      'durableObjectNamespaces = [(className = "Link", uniqueKey = "workhorse-link", preventEviction = true)]',
    );
    expect(config).toContain('(name = "IDENTITY", json = embed "identity.json")');
    expect(config).toContain('(name = "LINK", durableObjectNamespace = "Link")');
  });

  it("accepts links over TLS with its own keypair, and dials each peer pinning its certificate", () => {
    const linked = renderConfig(layout, [], {
      listen: "100.104.65.112:7841",
      dialed: [{ name: "home", address: "home.lan:7841", certificate }],
    });

    expect(linked).toContain(
      '(name = "link", address = "100.104.65.112:7841", https = (tlsOptions = (keypair = (privateKey = embed "tls-key.pem", certificateChain = embed "tls-certificate.pem"))), service = "daemon")',
    );
    expect(linked).toContain(
      '(name = "peer:home", external = (address = "home.lan:7841", https = (tlsOptions = (trustedCertificates = [embed "peer-home.pem"]), certificateHost = "daemon.workhorse"))),',
    );
    expect(linked).toContain('(name = "peer:home", service = "peer:home"),');
  });

  it("binds each root's disk directory under the name the daemon looks up", () => {
    expect(config).toContain(
      '(name = "fs:notes:notes", disk = (path = "/home/me/notes", writable = false)),',
    );
    expect(config).toContain('(name = "fs:notes:notes", service = "fs:notes:notes"),');
  });

  it("embeds the bundle and deployment beside the config, with the shared compatibility date", () => {
    expect(config).toContain('esModule = embed "daemon.js"');
    expect(config).toContain('json = embed "deployment.json"');
    expect(config).toContain(`compatibilityDate = "${COMPATIBILITY_DATE}"`);
    expect(config).toContain('compatibilityFlags = ["experimental"]');
  });
});
