// Worker bundle recipe — pi-in-workerd edition.
//
// The pi SDK graph cannot be bundled by wrangler's default pipeline for
// workerd (see worker/pi-workerd/README.md for the full rationale). This
// pre-builds the worker entry with the same adaptations:
//   - node builtins external (workerd nodejs_compat provides them)
//   - node:child_process + bare child_process → stub (never spawned here)
//   - @earendil-works/pi-tui → inert class stubs (never rendered)
//   - jiti → stub (no TS file loading in workerd; inline factories only)
//   - proper-lockfile / hosted-git-info / undici → stubs (CJS dynamic
//     requires workerd rejects; undici's installer is never called)
//   - typebox/compile → runtime Value.Check shim (workerd forbids the
//     codegen TypeCompiler uses)
//   - import.meta.url define (pi's config.js calls fileURLToPath on it)
//
// Wranger then deploys the prebuilt ESM with no_bundle: true.

import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const TUI_STUB = fileURLToPath(new URL("./pi-workerd/stub-tui.js", import.meta.url));
const COMPILE_SHIM = fileURLToPath(new URL("./pi-workerd/typebox-compile-shim.js", import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL("./src/index.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  outfile: fileURLToPath(new URL("./dist/worker.mjs", import.meta.url)),
  platform: "neutral",
  mainFields: ["module", "main", "browser"],
  target: "es2022",
  conditions: ["workerd", "node", "import", "module", "default"],
  preserveSymlinks: true,
  define: { "import.meta.url": '"file:///workhorse/worker.mjs"' },
  plugins: [{
    name: "node-stubs",
    setup(b) {
      b.onResolve({ filter: /^node:child_process$/ }, () => ({ path: "child-process-stub", namespace: "stub" }));
      b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, external: true }));
      b.onResolve({ filter: /^cloudflare:/ }, (a) => ({ path: a.path, external: true }));
      const BARE = /^(fs\/promises|timers\/promises|stream\/promises|fs|path|os|events|crypto|module|util|stream|assert|url|http|https|tty|net|zlib|worker_threads|vm|querystring|readline|string_decoder|util\/types|buffer|child_process|constants|timers|process|perf_hooks|async_hooks|punycode|dns|dgram|cluster|console|domain|v8|tls|http2|inspector|trace_events|wasi|diagnostics_channel|sys|repl)$/;
      b.onResolve({ filter: BARE }, (a) =>
        a.path === "child_process"
          ? { path: "child-process-stub", namespace: "stub" }
          : { path: `node:${a.path}`, external: true },
      );
      b.onResolve({ filter: /^@earendil-works\/pi-tui$/ }, () => ({ path: TUI_STUB, namespace: "file" }));
      b.onResolve({ filter: /^typebox\/compile$/ }, () => ({ path: COMPILE_SHIM, namespace: "file" }));
      b.onResolve({ filter: /^jiti(\/static)?$/ }, () => ({ path: "jiti-stub", namespace: "stub" }));
      b.onResolve({ filter: /^proper-lockfile$/ }, () => ({ path: "lockfile-stub", namespace: "stub" }));
      b.onResolve({ filter: /^hosted-git-info$/ }, () => ({ path: "hgi-stub", namespace: "stub" }));
      b.onResolve({ filter: /^undici$/ }, () => ({ path: "undici-stub", namespace: "stub" }));
      b.onResolve({ filter: /^cross-spawn$/ }, () => ({ path: "child-process-stub", namespace: "stub" }));
      // yaml is CJS with dynamic requires of node builtins at init (workerd
      // rejects those in an ESM bundle); pi uses it only for prompt-template
      // frontmatter, which the fleet never expands.
      b.onResolve({ filter: /^yaml$/ }, () => ({ path: "yaml-stub", namespace: "stub" }));
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
        contents: "export const setGlobalDispatcher = () => {}; export const install = () => {}; export const request = async () => { throw new Error('undici stubbed - use native fetch in workerd') }; export class Client {}; export class Pool {}; export class Agent {}; export const fetch = globalThis.fetch; export default { setGlobalDispatcher, install, request };",
        loader: "js",
      }));
      b.onLoad({ filter: /yaml-stub$/, namespace: "stub" }, () => ({
        contents: "export const parse = (s) => { throw new Error('yaml stubbed - no prompt-template frontmatter in workerd') }; export default { parse };",
        loader: "js",
      }));
    },
  }],
});
console.log("bundled dist/worker.mjs");
