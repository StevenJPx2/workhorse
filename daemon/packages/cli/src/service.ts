import { join } from "node:path";
import type { Layout } from "./layout.ts";

// The OS service manager keeps one daemon running (docs/architecture.md, "Lifecycle").

export type ServiceFile = { readonly path: string; readonly content: string };

const xml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// macOS. workerd does not remove a stale socket file, so a crashed daemon could never bind
// again; the agent removes it before starting. launchd runs one instance per label, so the file
// cannot belong to a live daemon. ThrottleInterval 1: the default 10 s delays crash recovery.
export function launchdAgent(
  home: string,
  label: string,
  layout: Layout,
  command: readonly string[],
): ServiceFile {
  const args = ["/bin/sh", "-c", 'rm -f "$0"; exec "$@"', layout.socket, ...command];

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
  warm: readonly string[],
): readonly ServiceFile[] {
  const dir = join(home, ".config", "systemd", "user");
  const exec = [...command, "--socket-fd", "main=3"].map(systemdWord).join(" ");
  const warmUp = warm.map(systemdWord).join(" ");

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
