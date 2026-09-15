// fallow-ignore-file unused-file
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const TUI_STUB = fileURLToPath(new URL("./stub-tui.js", import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL("./spike-entry.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  outfile: fileURLToPath(new URL("./dist/entry.mjs", import.meta.url)),
  platform: "neutral",
  mainFields: ["module", "main", "browser"],
  target: "es2022",
  conditions: ["workerd", "node", "import", "module", "default"],
  define: { "import.meta.url": '"file:///pi-workerd-spike/entry.mjs"' },
  external: [],
  plugins: [{
    name: "node-stubs",
    setup(b) {
      // child_process (both spellings) → stub; all other node builtins → external.
      b.onResolve({ filter: /^node:child_process$/ }, () => ({ path: "child-process-stub", namespace: "stub" }));
      b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, external: true }));
      const BARE = /^(fs\/promises|timers\/promises|stream\/promises|fs|path|os|events|crypto|module|util|stream|assert|url|http|https|tty|net|zlib|worker_threads|vm|querystring|readline|string_decoder|buffer|child_process|constants|timers|process|perf_hooks|async_hooks|punycode|dns|dgram|cluster|console|domain|v8|tls|http2|inspector|trace_events|wasi|diagnostics_channel|sys|repl)$/;
      b.onResolve({ filter: BARE }, (a) =>
        a.path === "child_process"
          ? { path: "child-process-stub", namespace: "stub" }
          : { path: `node:${a.path}`, external: true },
      );
      // TUI components — inert stubs.
      b.onResolve({ filter: /^@earendil-works\/pi-tui$/ }, () => ({ path: TUI_STUB, namespace: "file" }));
      // typebox/compile codegens validators (new Function) — workerd forbids
      // that, so alias the module to a runtime (Value.Check) shim.
      b.onResolve({ filter: /^typebox\/compile$/ }, () => ({ path: fileURLToPath(new URL("./typebox-compile-shim.js", import.meta.url)), namespace: "file" }));
      b.onResolve({ filter: /^cross-spawn$/ }, () => ({ path: "child-process-stub", namespace: "stub" }));
      b.onResolve({ filter: /^jiti(\/static)?$/ }, () => ({ path: "jiti-stub", namespace: "stub" }));
      b.onResolve({ filter: /^proper-lockfile$/ }, () => ({ path: "lockfile-stub", namespace: "stub" }));
      b.onResolve({ filter: /^hosted-git-info$/ }, () => ({ path: "hgi-stub", namespace: "stub" }));
      b.onResolve({ filter: /^undici$/ }, () => ({ path: "undici-stub", namespace: "stub" }));
      b.onResolve({ filter: /^jiti(\/static)?$/ }, () => ({ path: "jiti-stub", namespace: "stub" }));
      // The stub module for child_process.
      b.onLoad({ filter: /child-process-stub$/, namespace: "stub" }, () => ({
        contents: "export const spawn = () => { throw new Error('node:child_process stubbed - not available in workerd') }; export const spawnSync = spawn; export const execSync = spawn; export const execFile = spawn; export const execFileSync = spawn; export const fork = spawn; export default {};",
        loader: "js",
      }));
      b.onLoad({ filter: /jiti-stub$/, namespace: "stub" }, () => ({
        contents: "export const createJiti = () => { throw new Error('jiti stubbed - no TS file loading in workerd; use inline extensionFactories') }; export default createJiti;",
        loader: "js",
      }));
      b.onLoad({ filter: /lockfile-stub$/, namespace: "stub" }, () => ({
        contents: "export const lock = async () => () => {}; export const unlock = async () => {}; export const check = async () => false; export default { lock, unlock, check };",
        loader: "js",
      }));
      b.onLoad({ filter: /hgi-stub$/, namespace: "stub" }, () => ({
        contents: "export default class HostedGitInfo { static fromUrl() { return null } }; export class fromUrl {};",
        loader: "js",
      }));
      b.onLoad({ filter: /undici-stub$/, namespace: "stub" }, () => ({
        contents: [
          "export const setGlobalDispatcher = () => {}",
          "export const install = () => {}",
          "export const request = async () => { throw new Error('undici stubbed - use native fetch in workerd') }",
          "export class Client {}",
          "export class Pool {}",
          "export class Agent {}",
          "export const fetch = globalThis.fetch",
          "export default { setGlobalDispatcher, install, request }",
        ].join(";\n"),
        loader: "js",
      }));
    },
  }],
});
console.log("bundled dist/entry.mjs");
