import { describe, expect, it } from "vite-plus/test";
import type { DiskRoot } from "../src/config.ts";
import { layoutOf } from "../src/layout.ts";
import { bubblewrapArgs, sandboxedArgs, seatbeltProfile, serveArgs } from "../src/sandbox.ts";
import { launchdAgent, systemdUnits } from "../src/service.ts";

const layout = layoutOf("/home/me/.workhorse");

const roots: DiskRoot[] = [
  { binding: "fs:notes:notes", path: "/home/me/notes", writable: false },
  { binding: "fs:skills:skills", path: "/home/me/skills", writable: true },
];

// Pairs of [flag, source] from a bubblewrap argument list.
const mounts = (args: readonly string[]) =>
  args.flatMap((arg, index) =>
    arg.startsWith("--") && arg.includes("bind") ? [`${arg} ${args[index + 1]}`] : [],
  );

describe("seatbeltProfile", () => {
  const profile = seatbeltProfile(layout, roots, undefined);

  it("binds no TCP port without --listen, and only the listen port with it", () => {
    expect(profile).not.toMatch(/local ip/);
    expect(seatbeltProfile(layout, roots, "100.104.65.112:7841")).toContain(
      '(allow network-bind network-inbound (local ip "*:7841"))',
    );
    expect(seatbeltProfile(layout, roots, "[fd7a::1]:7841")).toContain('(local ip "*:7841")');
  });

  it("denies by default and grants each root only its policy mode", () => {
    expect(profile).toMatch(/^\(version 1\)\n\(deny default\)/);
    expect(profile).toContain('(allow file-read* (subpath "/home/me/notes"))');
    expect(profile).toContain('(allow file-read* file-write* (subpath "/home/me/skills"))');
    expect(profile).not.toContain('file-write* (subpath "/home/me/notes")');
  });

  it("allows Unix sockets only in its own folder and the DNS resolver", () => {
    expect(profile).toContain('(local unix-socket (subpath "/home/me/.workhorse/sock"))');
    expect(profile.match(/remote unix-socket/g)).toEqual(["remote unix-socket"]);
    expect(profile).toContain('(path-literal "/private/var/run/mDNSResponder")');
  });
});

describe("bubblewrapArgs", () => {
  it("mounts the daemon's folders and roots by mode, and nothing from /home or /run", () => {
    const args = bubblewrapArgs(layout, roots, undefined);
    expect(args.slice(0, 4)).toEqual([
      "--die-with-parent",
      "--unshare-all",
      "--share-net",
      "--new-session",
    ]);
    expect(mounts(args)).toEqual(
      expect.arrayContaining([
        "--ro-bind /home/me/.workhorse/bin",
        "--ro-bind /home/me/.workhorse/etc",
        "--bind /home/me/.workhorse/state",
        "--bind /home/me/.workhorse/sock",
        "--ro-bind /home/me/notes",
        "--bind /home/me/skills",
      ]),
    );
    expect(mounts(args).filter((mount) => / \/(home|run)$/.test(mount))).toEqual([]);
    // A file bound inside a bound folder fails when the file is a symlink (NixOS).
    expect(mounts(args)).toContain("--ro-bind-try /etc/ssl/certs/ca-certificates.crt");
    expect(mounts(args)).not.toContain("--ro-bind-try /etc/ssl/certs");
  });

  it("also mounts a custom loader's store folder", () => {
    const loader = "/nix/store/abc-glibc-2.44/lib/ld-linux-x86-64.so.2";
    expect(mounts(bubblewrapArgs(layout, [], loader))).toContain(
      "--ro-bind-try /nix/store/abc-glibc-2.44",
    );
  });
});

describe("sandboxedArgs", () => {
  it("wraps the same workerd command in each sandbox", () => {
    const serve = serveArgs(layout);
    expect(sandboxedArgs({ type: "none" }, layout, roots)).toEqual(serve);
    expect(sandboxedArgs({ type: "seatbelt", profile: "/p.sb" }, layout, roots)).toEqual([
      "/usr/bin/sandbox-exec",
      "-f",
      "/p.sb",
      ...serve,
    ]);
    expect(
      sandboxedArgs(
        { type: "bubblewrap", bwrap: "/usr/bin/bwrap", loader: undefined },
        layout,
        roots,
      ).slice(-serve.length),
    ).toEqual(serve);
  });
});

const warm = { runtime: "/bin/bun", cli: "/cli/main.ts", base: "/home/me/.workhorse" };

describe("launchdAgent", () => {
  const agent = launchdAgent(
    "/Users/me",
    "dev.workhorse.daemon",
    layoutOf("/Users/me/a&b"),
    ["/bin/workerd"],
    { ...warm, base: "/Users/me/a&b" },
  );

  const args = [...agent.content.matchAll(/^ {4}<string>(.*)<\/string>$/gm)].map(
    (match) => match[1],
  );

  it("removes a stale socket before starting, restarts quickly, and escapes XML", () => {
    expect(agent.path).toBe("/Users/me/Library/LaunchAgents/dev.workhorse.daemon.plist");
    expect(agent.content).toContain("<string>/Users/me/a&amp;b/sock/daemon.sock</string>");
    expect(agent.content).toContain("<key>ThrottleInterval</key><integer>1</integer>");
    expect(agent.content).toContain("<key>KeepAlive</key><true/>");
  });

  it("warms in the background after every start, passing paths as arguments, never as script", () => {
    expect(args).toEqual([
      "/bin/sh",
      "-c",
      "rm -f &quot;$0&quot;; &quot;$1&quot; &quot;$2&quot; warm --base &quot;$3&quot; &gt; /dev/null 2&gt;&amp;1 &amp; shift 3; exec &quot;$@&quot;",
      "/Users/me/a&amp;b/sock/daemon.sock",
      "/bin/bun",
      "/cli/main.ts",
      "/Users/me/a&amp;b",
      "/bin/workerd",
    ]);
  });
});

describe("systemdUnits", () => {
  const [socket, service] = systemdUnits(
    "/home/me",
    "workhorse",
    layout,
    ["/usr/bin/bwrap", "/a b/workerd"],
    warm,
  );

  it("lets the socket unit own a private socket", () => {
    expect(socket?.path).toBe("/home/me/.config/systemd/user/workhorse.socket");
    expect(socket?.content).toContain(
      "ListenStream=/home/me/.workhorse/sock/daemon.sock\nSocketMode=0600",
    );
  });

  it("passes the socket as fd 3, quotes every word, and limits a crash loop", () => {
    expect(service?.content).toContain(
      'ExecStart="/usr/bin/bwrap" "/a b/workerd" "--socket-fd" "main=3"',
    );
    expect(service?.content).toContain("StartLimitIntervalSec=60\nStartLimitBurst=10");
    expect(service?.content).toContain("Restart=always");
  });

  it("starts at login and warms after every start without failing the service on a warm error", () => {
    expect(service?.content).toContain("[Install]\nWantedBy=default.target");
    expect(service?.content).toContain(
      'ExecStartPost=-"/bin/bun" "/cli/main.ts" "warm" "--base" "/home/me/.workhorse"',
    );
  });
});
