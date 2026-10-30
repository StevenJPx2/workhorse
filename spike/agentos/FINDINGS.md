# Spike 8: agentOS as a sandbox backend

Evidence, not production design. Question: can agentOS (`@rivet-dev/agentos-core` 0.4.6, Apache-2.0, "beta, still undergoing security review") be a backend for Workhorse's universal sandbox policy on hosts without an OS sandbox, such as Rivet or the cloud? Four tests: a coding agent runs inside it, it holds against escape probes, all egress can be forced through the broker, and what it costs against nono.

## What agentOS is

A Rust sidecar process, started by the library, runs a virtual POSIX kernel per VM: process table, VFS, socket table, permissions and limits. Guest JavaScript runs in V8 isolates with a Node 22.0 compatibility layer; the shell, coreutils and other tools are wasm. Guest processes never become host processes, and guest sockets never become host sockets unless policy allows it. The security boundary is the sidecar against the executor: the sidecar itself runs with the host user's privileges.

## What was built

| Part | What it is |
|---|---|
| `src/policy.ts` | The part of Workhorse's sandbox policy this spike needs (filesystem roots, broker-only egress, environment, memory and process limits), compiled to `AgentOs.create` options |
| `src/broker.ts` | Host-side broker on loopback, playing a scripted OpenAI-compatible model: turn 1 asks for a `bash` tool call, turn 2 answers with the tool's output. Records every request |
| `guest/egress.mjs` | Inside the VM: 12 routes out (broker, a decoy host port, `localhost`, `::1`, `0.0.0.0`, the internet by name and by IP, a model provider, DNS, UDP, cloud metadata) |
| `guest/escape.mjs` | Inside the VM: 26 escape probes against what the host planted |
| `guest/pi-steps.mjs` | Inside the VM: Pi's SDK step by step with timestamps, used to locate a stall |
| `test/agent.ts` | Tests 1 and 3 |
| `test/probes.ts` | Test 2, plus resource limits and isolation between two VMs |
| `test/measure.ts` | Test 4, Linux only |

```sh
bun install                          # Bun installs; the tests run under Node (see below)
node test/agent.ts                   # tests 1 and 3
node test/probes.ts                  # test 2
ROUNDS=5 node test/measure.ts        # test 4, Linux with nono and node on PATH
```

On NixOS the sidecar binary needs its loader patched, as workerd did: `patchelf --set-interpreter` to the store's glibc loader and `--set-rpath` to glibc and `stdenv.cc.cc.lib`, written to a copy because Bun hard-links packages into its cache.

## Test 1: a coding agent inside

**Pi 0.73.1 runs its full loop inside a VM**: two model turns through the broker and a real `bash` tool call whose file the host reads back from the VM. 2.0 s end to end on the M1, 5.3 s on the homelab. Getting there took three findings:

| Agent | Result | Cause |
|---|---|---|
| OpenCode, Codex, Claude Code (native builds) | Cannot run | Native binaries need an `.aospkg` built for agentOS. The 0.4.6 release has none for agents; the old `@agentos-software/{opencode,codex,claude-code,pi}` npm packages are marked "no longer published" |
| Pi 1.4.0 (current) | Fails at import | The guest's Node layer reports v22.0.0 and lacks `module.enableCompileCache`, `zlib.crc32` and `fs.globSync`; Pi 1.4 needs Node ≥ 22.19 |
| Pi 0.73.1 | Runs | Needs Node ≥ 20.6 |

Pi's CLI first stalled for 120 s before its first request, burning about 24 s of guest CPU. Bisected with `guest/pi-steps.mjs`: the SDK path completes in 3.4 s, so the stall was in the CLI, which reads piped stdin until `end`. **In agentOS 0.4.6, guest Node never receives `end` on stdin when it comes from `exec`'s `stdin` option or from `< /dev/null`**, even with data; only a pipe from another guest process ends (`echo hi | node …` works). Workaround: `true | node pi …`. Pi's own blocked startup requests to `pi.dev` did not slow it down.

The library hangs in `AgentOs.create()` under Bun 1.4.4; it runs under Node 26.

## Test 2: escape probes

The host planted a canary file outside every mount, symlinks to it in a read-only and a read-write root, a Unix socket server, a secret in its own environment, and its pid. All 26 probes held, on macOS and on Linux:

| Area | Probes | Result |
|---|---|---|
| Filesystem | Absolute path, `..` through a mount, host-made symlinks in both roots, guest-made absolute and relative symlinks, hard link, write to the read-only root, rename out of a root, list the host home | `ENOENT`, `EACCES` for every symlink, `EROFS`, `EXDEV` |
| Environment | `process.env`, `/proc/self/environ`, `/proc/1/environ` | No host secret; the guest sees only the VM's variables |
| Processes | Signal the host pid, find it in `/proc`, spawn a host binary, reach host files from the shell | `ESRCH`; `/proc` lists only the VM's processes |
| Runtime | `process.dlopen`, `process.binding`, `node:inspector` (open a port, run a session), `node:wasi`, `node:cluster`, `worker_threads` | Denied or not implemented. `node:inspector` imports, though the docs list it as denied, but it is an empty stub |
| Sockets | Connect to the host's Unix socket, bind one in a read-write root | `ENOENT`; `ENOTSUP` |

The host checked the same facts from outside: no guest output contained the canary, the Unix socket saw no connection, the read-only root's contents hash was unchanged, and nothing appeared beside the roots.

Limits (128 MB heap, 16 processes): a heap bomb ends at the V8 heap limit in 0.2–0.7 s, an `ArrayBuffer` bomb at its cap, 64 spawns start 14 children and refuse 50, a CPU spin dies at its 3 s deadline, and the VM keeps working afterwards. A second VM cannot read the first's files or reach its listener.

**One hazard is on the host side**: symlinks the guest creates in a read-write root become real host symlinks (`guest-link -> …/canary.txt`, also the relative one). The guest cannot follow them, but any host process that later reads that root and follows symlinks can. Whatever reads an agent's read-write root on the host must not follow symlinks; the same holds for nono or bubblewrap bind mounts.

Bite check: compiling read-only roots as writable makes `write into ro mount` escape and the test fail.

## Test 3: broker-only egress

Policy: network `default: "deny"` with agentOS's VM-local rules, one allow rule for `tcp://127.0.0.1:<broker>`, and `loopbackExemptPorts: [<broker>]`. Of 12 routes, only the broker is reached, by `127.0.0.1` and by `localhost` (which resolves to it). `::1`, `0.0.0.0`, a decoy host port, the internet by name and by IP, a model provider, DNS, UDP and `169.254.169.254` are refused within 0.65 s in total. The broker's log matches the guest's attempts exactly, and the decoy port saw no connection.

Bite check: `default: "allow"` makes the internet, DNS, UDP and the provider reachable, and the test fails. Even then, the decoy host port and the metadata address stay refused: loopback confinement and restricted ranges are separate controls.

Note that agentOS's default policy is not deny: outbound access is limited to a built-in allowlist of model provider endpoints. Workhorse must always send an explicit network rule set.

## Test 4: cost against nono

On the homelab (NixOS, i5-2435M, 4 threads, 8 GB), Node 26.11.1 and nono 0.79.0 from nixpkgs. Each round runs in a fresh Node process, so its first VM pays for starting the sidecar. Per round:

- **agentOS**: the first VM to its first `exec("true")` (cold); guest `node -e 0` twice; one Pi run through the broker (`piRunMs`); nine more VMs (warm, median); memory with 1 VM, with 10 VMs, with an idle `node` in each, and with an idle Pi in RPC mode in each.
- **nono**: host `node -e 0`, the same under `nono run`; memory of 10 sandboxed idle `node` processes and of 10 sandboxed idle Pi processes.

Memory is `RssAnon + RssShmem` from `/proc/<pid>/status`, summed over the process tree: the sidecar and everything under it, or each nono supervisor and its child. A Pi counts only after it answers an RPC `get_state` request, on both sides, and each round checks that every agent is still running when measured and that nothing is left running afterwards.

The first full run was discarded, for three reasons worth keeping:

1. **SIGKILL to nono's supervisor orphans the sandboxed child**, which keeps running under init. 90 idle `node` processes from earlier rounds slowed the later rounds (cold start rose from 1.8 s to 11.8 s). Kill the whole tree. This matters for Workhorse's own use of nono, not only for this spike.
2. **nono's supervisor denies `/proc/<pid>/smaps_rollup`**; the first harness counted unreadable processes as zero. `/proc/<pid>/status` is readable, and where both are readable `RssAnon` and `Private_Dirty` agree within 0.1%.
3. **A fixed wait does not mean an agent has loaded**: ten Pi processes starting at once on 4 threads were not all loaded after 9 s. Readiness is now an answered RPC request.

The clean run: 5 rounds with agentOS's default pool of four pre-started V8 isolates (`measure-raw-linux.jsonl`) and 3 with the pool off, `AGENTOS_V8_WARM_ISOLATES=0` (`measure-raw-linux-nopool.jsonl`). Medians, with the range across rounds. In that run the copy on the homelab was missing the last edit to the nono liveness check, which matched Pi by command line although Pi renames its process, so `idlePiAlive` reads 0 for nono. Every Pi had answered its RPC request, and one more round with the current code (`measure-raw-linux-check.jsonl`) reports all 10 alive with the same memory.

**Memory**, ten agents:

| | agentOS, pool on | agentOS, pool off | nono |
|---|---|---|---|
| Sidecar with one empty VM | 222 MB (206–223) | 87 MB | None |
| Each further empty VM | about 21 MB | about 27 MB | None |
| 10 agents running an idle `node` | 593 MB (562–605) | 482 MB | **111 MB** (11 MB each, nono's supervisor included) |
| 10 agents running an idle Pi | 1,583 MB (1,563–1,595), idle `node` processes still running | 1,507 MB | **895 MB** (889–916), about 90 MB each |

Per agent beyond the first, an idle `node` costs about 39 MB in agentOS (21 MB of VM plus 18 MB of process) against 11 MB under nono. Pi costs about 99 MB more per VM in agentOS, so about 120 MB with its VM, against about 90 MB under nono: a third more, plus the sidecar's fixed 60–220 MB. The VM's own figure matches agentOS's published "about 22 MB" for a shell workload.

**Time:**

| | agentOS | nono |
|---|---|---|
| First agent, cold | 2.24 s (1.76–2.49) to the first VM's `exec("true")`, sidecar start included | 0.74 s (0.73–0.87) for a sandboxed `node -e 0`; bare `node -e 0` takes 0.09 s |
| Each further agent | 1.39 s (0.91–1.40) to a new VM's first `exec`, plus 0.55–0.66 s per guest `node` start | 0.74 s |
| Ten Pi agents to answering RPC, started together | 23.5 s (11.2–23.9) | 24.1 s (15.6–24.6) |
| One Pi run through the broker | 9.0 s (5.0–13.2), with ten idle VMs not yet created | Not measured |

On the M1 the same steps are much faster (a VM in 123 ms, Pi's whole run in 2.0 s), so the homelab's 4 slow threads dominate its absolute times. Loading ten Pi agents at once is CPU-bound and takes the same time either way.

Two facts here concern `nono run` itself, independent of agentOS: **it adds about 0.65 s to every process start on this machine**, and **killing its supervisor alone leaves the sandboxed process running**.

## Verdict

**agentOS enforces Workhorse's sandbox policy well, but only for JavaScript agents, and it costs more than nono. Keep it as a candidate backend for hosts without an OS sandbox; do not adopt it now.**

| Question | Answer |
|---|---|
| Does a coding agent run inside? | Pi 0.73.1 only, after a stdin workaround. Native agents need agentOS packages that do not exist. Current Pi needs Node APIs (≥ 22.19) the guest lacks |
| Does it hold? | All 26 escape probes, on macOS and Linux; limits and VM-to-VM isolation hold. Beta and still under security review, and its trusted computing base is a 151 MB Rust and V8 sidecar running as the host user |
| Can egress be broker-only? | Yes, by policy: one allow rule plus one loopback exemption. agentOS's default is not deny, so Workhorse must always send the full rule set |
| What does it cost? | About a third more memory per Pi agent than nono, plus a fixed 60–220 MB sidecar; a new agent takes about 2 s against 0.74 s on the homelab |

Consequences for Workhorse:

1. **Where nono or bubblewrap work (laptop, home), they stay the backend.** They run any agent binary, cost less, and their boundary is the OS kernel rather than a user-space sidecar.
2. **agentOS fits only where no OS sandbox is available**, such as a Rivet host or a container without user namespaces, and only for agents that run on its Node layer. On such a host, run the sidecar itself inside the host's container or VM boundary: a V8 or sidecar escape gives the host user's privileges.
3. **The policy compiles cleanly**: roots to mounts, broker-only egress to one rule and one exemption, memory and process limits to `limits`. The sandbox contract needs no change to admit a virtualized backend.
4. **Two findings about `nono run` (the CLI supervisor, not the self-sandboxing library spike 1 used) apply to Workhorse regardless**: if plugins are launched through it, kill the whole process tree, not the supervisor alone; and its start-up cost (about 0.65 s per process here) belongs in the cold-start budget for sandboxed plugins. No daemon code uses nono today.
5. **Revisit when** agentOS leaves beta, its Node layer reaches the versions agents need, and it ships agent packages. The stdin bug was not found among its open issues; issue 1657 covers the shell's `< file` redirection. Issue 1897 reports that the sidecar serializes agent prompts across sessions and VMs; it concerns agentOS's own managed agent sessions, which this spike did not use, but should be checked before relying on one sidecar for many agents.
