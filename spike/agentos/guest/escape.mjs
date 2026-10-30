// Runs inside the VM. Tries to reach what the host planted outside the sandbox; prints one
// JSON line per probe: {name, escaped, detail}. `escaped` is the guest's own view; the host
// checks the same facts from outside (canary bytes, socket connections, file hashes).
// Usage: node escape.mjs '<json args>'
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";

const args = JSON.parse(process.argv[2]);
const { canaryPath, canaryToken, roMount, rwMount, socketPath, hostPid } = args;

function probe(name, run) {
  try {
    const { escaped, detail } = run();
    console.log(JSON.stringify({ name, escaped, detail }));
  } catch (error) {
    console.log(JSON.stringify({ name, escaped: false, detail: String(error?.code ?? error?.message ?? error).slice(0, 160) }));
  }
}

async function probeAsync(name, run) {
  try {
    const { escaped, detail } = await run();
    console.log(JSON.stringify({ name, escaped, detail }));
  } catch (error) {
    console.log(JSON.stringify({ name, escaped: false, detail: String(error?.code ?? error?.message ?? error).slice(0, 160) }));
  }
}

const leaks = (text) => String(text).includes(canaryToken);
const read = (path) => {
  const text = fs.readFileSync(path, "utf8");
  return { escaped: leaks(text), detail: `read ${text.length} bytes` };
};

// Filesystem
probe("read host canary by absolute path", () => read(canaryPath));
probe("read through ro mount with ..", () => read(`${roMount}/../../../../../../../../..${canaryPath}`));
probe("read host-made symlink in ro mount", () => read(`${roMount}/escape-link`));
probe("read host-made symlink in rw mount", () => read(`${rwMount}/escape-link`));
probe("guest-made symlink in rw mount", () => {
  fs.symlinkSync(canaryPath, `${rwMount}/guest-link`);
  return read(`${rwMount}/guest-link`);
});
probe("guest-made relative symlink in rw mount", () => {
  fs.symlinkSync(`../../../../../../../../../..${canaryPath}`, `${rwMount}/guest-rel-link`);
  return read(`${rwMount}/guest-rel-link`);
});
probe("hard link out of rw mount", () => {
  fs.linkSync(canaryPath, `${rwMount}/hard-link`);
  return read(`${rwMount}/hard-link`);
});
probe("write into ro mount", () => {
  fs.writeFileSync(`${roMount}/planted.txt`, "guest was here");
  return { escaped: true, detail: "write succeeded" };
});
probe("rename out of rw mount", () => {
  fs.writeFileSync(`${rwMount}/move-me.txt`, "x");
  fs.renameSync(`${rwMount}/move-me.txt`, "/tmp/moved.txt");
  return { escaped: false, detail: "renamed within the VM namespace (host file left rw mount)" };
});
probe("list host home", () => ({ escaped: fs.readdirSync("/Users").length > 0, detail: fs.readdirSync("/Users").join(",") }));

// Environment
probe("process.env carries host secret", () => ({ escaped: Object.values(process.env).some(leaks), detail: `${Object.keys(process.env).length} vars` }));
probe("/proc/self/environ carries host secret", () => read("/proc/self/environ"));
probe("/proc/1/environ carries host secret", () => read("/proc/1/environ"));

// Processes
probe("signal host process", () => {
  process.kill(hostPid, 0);
  return { escaped: true, detail: "kill(hostPid, 0) succeeded" };
});
probe("host pid visible in /proc", () => ({ escaped: fs.existsSync(`/proc/${hostPid}`), detail: fs.readdirSync("/proc").filter((entry) => /^\d+$/.test(entry)).join(",") }));
probe("spawn a host binary", () => {
  const result = spawnSync("/usr/bin/osascript", ["-e", "return 1"], { encoding: "utf8" });
  return { escaped: result.status === 0, detail: String(result.error?.code ?? result.status) };
});
probe("shell reaches host files", () => {
  const out = execFileSync("sh", ["-c", `cat ${canaryPath} 2>&1; ls /Users 2>&1; true`], { encoding: "utf8" });
  return { escaped: leaks(out), detail: out.trim().slice(0, 160) };
});

// Native code and runtime internals
probe("load a native addon", () => {
  process.dlopen({ exports: {} }, "/usr/lib/libSystem.B.dylib");
  return { escaped: true, detail: "dlopen succeeded" };
});
probe("process.binding", () => ({ escaped: typeof process.binding("fs")?.open === "function", detail: "binding returned" }));
// node:inspector imports (the docs list it as denied), so test what it can do: open a
// debugger port, or evaluate code through a session.
await probeAsync("node:inspector opens a debugger port", async () => {
  const inspector = await import("node:inspector");
  inspector.open(9229, "127.0.0.1");
  const url = inspector.url();
  return { escaped: url !== undefined, detail: `url ${url}` };
});
await probeAsync("node:inspector session evaluates code", async () => {
  const inspector = await import("node:inspector");
  const session = new inspector.Session();
  session.connect();
  const result = await new Promise((resolve, reject) =>
    session.post("Runtime.evaluate", { expression: "typeof process.binding" }, (error, value) => (error ? reject(error) : resolve(value))),
  );
  return { escaped: result !== undefined, detail: JSON.stringify(result).slice(0, 120) };
});
for (const builtin of ["wasi", "cluster"]) {
  await probeAsync(`import node:${builtin}`, async () => {
    await import(`node:${builtin}`);
    return { escaped: true, detail: "imported" };
  });
}
await probeAsync("worker_threads starts a real thread", async () => {
  const { Worker } = await import("node:worker_threads");
  const worker = new Worker("process.exit(0)", { eval: true });
  await worker.terminate();
  return { escaped: false, detail: "Worker constructed; threads are not an escape by themselves" };
});

// Sockets
await probeAsync("connect host unix socket", () =>
  new Promise((resolve, reject) => {
    const socket = net.connect(socketPath, () => {
      socket.destroy();
      resolve({ escaped: true, detail: "connected" });
    });
    socket.on("error", reject);
    setTimeout(() => reject(new Error("timeout")), 5_000).unref();
  }),
);
await probeAsync("bind unix socket in rw mount", () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(`${rwMount}/guest.sock`, () => {
      server.close();
      resolve({ escaped: true, detail: "listening on a host-backed path" });
    });
  }),
);
