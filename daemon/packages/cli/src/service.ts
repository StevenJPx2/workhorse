import { join } from "node:path";
import type { Layout } from "./layout.ts";

// The OS service manager keeps one daemon running (docs/architecture.md, "Lifecycle").

export type ServiceFile = { readonly path: string; readonly content: string };

/** How the service runs `workhorse warm`: the runtime, the CLI entry, and the daemon's base folder. */
export type Warm = { readonly runtime: string; readonly cli: string; readonly base: string };

/** `workhorse warm` as a command line. */
function warmArgs(warm: Warm): readonly string[] {
  return [warm.runtime, warm.cli, "warm", "--base", warm.base];
}

const xml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// macOS. workerd does not remove a stale socket file, so a crashed daemon could never bind
// again; the agent removes it before starting. launchd runs one instance per label, so the file
// cannot belong to a live daemon. ThrottleInterval 1: the default 10 s delays crash recovery.
// launchd has no post-start hook, so the agent starts `workhorse warm` in the background after
// every start; it retries until the socket answers, and also starts the daemon's links. Its words
// are positional arguments, never part of the script.
const LAUNCH = 'rm -f "$0"; "$1" "$2" warm --base "$3" > /dev/null 2>&1 & shift 3; exec "$@"';

export function launchdAgent(
  home: string,
  label: string,
  layout: Layout,
  command: readonly string[],
  warm: Warm,
): ServiceFile {
  const args = [
    "/bin/sh",
    "-c",
    LAUNCH,
    layout.socket,
    warm.runtime,
    warm.cli,
    warm.base,
    ...command,
  ];

  return {
    path: join(home, "Library", "LaunchAgents", `${label}.plist`),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${xml(arg)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${xml(layout.etc)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>1</integer>
  <key>StandardOutPath</key><string>${xml(join(layout.log, "out.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(join(layout.log, "err.log"))}</string>
</dict>
</plist>
`,
  };
}

// Paths were vetted to contain no quotes or backslashes, so double quotes are enough.
const systemdWord = (arg: string) => `"${arg.replaceAll("%", "%%")}"`;

// Linux. The socket unit owns the listening socket and passes it as fd 3, so no stale file
// survives a crash and clients wait during a restart. A crash loop stops after 10 failed starts
// in 60 s instead of retrying forever. The service also starts at login, like the launchd agent,
// and `warm` runs after every start; its failure ("-") never fails the service.
export function systemdUnits(
  home: string,
  label: string,
  layout: Layout,
  command: readonly string[],
  warm: Warm,
): readonly ServiceFile[] {
  const dir = join(home, ".config", "systemd", "user");
  const exec = [...command, "--socket-fd", "main=3"].map(systemdWord).join(" ");
  const warmUp = warmArgs(warm).map(systemdWord).join(" ");

  return [
    {
      path: join(dir, `${label}.socket`),
      content: `[Unit]\nDescription=Workhorse daemon socket (${label})\n\n[Socket]\nListenStream=${layout.socket}\nSocketMode=0600\n\n[Install]\nWantedBy=sockets.target\n`,
    },
    {
      path: join(dir, `${label}.service`),
      content: `[Unit]\nDescription=Workhorse daemon (${label})\nRequires=${label}.socket\nStartLimitIntervalSec=60\nStartLimitBurst=10\n\n[Service]\nWorkingDirectory=${layout.etc}\nExecStart=${exec}\nExecStartPost=-${warmUp}\nRestart=always\nRestartSec=0\n\n[Install]\nWantedBy=default.target\n`,
    },
  ];
}
