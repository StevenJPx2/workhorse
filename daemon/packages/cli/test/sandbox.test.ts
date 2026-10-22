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
  const profile = seatbeltProfile(layout, roots);

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

describe("launchdAgent", () => {
  it("removes a stale socket before starting, restarts quickly, and escapes XML", () => {
    const agent = launchdAgent("/Users/me", "dev.workhorse.daemon", layoutOf("/Users/me/a&b"), [
      "/bin/workerd",
    ]);

    expect(agent.path).toBe("/Users/me/Library/LaunchAgents/dev.workhorse.daemon.plist");
    expect(agent.content).toContain("<string>rm -f &quot;$0&quot;; exec &quot;$@&quot;</string>");
    expect(agent.content).toContain("<string>/Users/me/a&amp;b/sock/daemon.sock</string>");
    expect(agent.content).toContain("<key>ThrottleInterval</key><integer>1</integer>");
    expect(agent.content).toContain("<key>KeepAlive</key><true/>");
  });
});

describe("systemdUnits", () => {
  const [socket, service] = systemdUnits(
    "/home/me",
    "workhorse",
    layout,
    ["/usr/bin/bwrap", "/a b/workerd"],
    ["/bin/bun", "/cli/main.ts", "warm", "--base", "/home/me/.workhorse"],
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
