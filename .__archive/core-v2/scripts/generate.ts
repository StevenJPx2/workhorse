/**
 * Node-native plop runner (uses tsx to execute TypeScript).
 *
 * Usage (interactive):
 *   aube run generate
 *
 * Usage (non-interactive / CI):
 *   aube run generate service --name git
 *   aube run generate tool --service git --name read-config
 *   aube run generate skill --name code-review --description "Review PRs"
 *
 * Why a custom runner?
 * Plop's CLI (liftoff + interpret) relies on ts-node / sucrase to load .ts
 * plopfiles.  We run under Node with tsx, so we call node-plop directly and
 * feed it our plopfile, bypassing the loader dance entirely.
 */

import nodePlop from "node-plop";
import readline from "node:readline/promises";
import { resolve } from "node:path";

// ─── Parse CLI arguments ─────────────────────────────────────────────────────

const [_exec, _script, generatorArg, ...rest] = process.argv;

type BypassMap = Record<string, string>;

function argKey(arg: string): string {
  const eq = arg.indexOf("=");
  return arg.slice(2, eq === -1 ? undefined : eq);
}

function inlineValue(arg: string): string | undefined {
  const eq = arg.indexOf("=");
  return eq === -1 ? undefined : arg.slice(eq + 1);
}

function nextValue(args: string[], i: number): [string, number] {
  const next = args[i + 1];
  const hasValue = next !== undefined && !next.startsWith("--");
  return hasValue ? [next, i + 1] : ["", i];
}

function parseArgPair(args: string[], i: number): [string, number] {
  const arg = args[i] ?? "";
  const key = argKey(arg);
  const value = inlineValue(arg);

  if (value !== undefined) {
    return [`${key}=${value}`, i];
  }

  const [next, nextIndex] = nextValue(args, i);
  return [`${key}=${next}`, nextIndex];
}

function parseBypass(args: string[]): BypassMap {
  const map: BypassMap = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (!arg.startsWith("--")) {
      continue;
    }

    const [pair, nextIndex] = parseArgPair(args, i);
    const eq = pair.indexOf("=");
    map[pair.slice(0, eq)] = pair.slice(eq + 1);
    i = nextIndex;
  }

  return map;
}

const bypassMap = parseBypass(rest);

// ─── Load plopfile ─────────────────────────────────────────────────────────--

const plop = await nodePlop(resolve(import.meta.dirname, "..", "plopfile.ts"));

// ─── Resolve generator ───────────────────────────────────────────────────────

const generatorList = plop.getGeneratorList();

if (generatorList.length === 0) {
  console.error("No generators found in plopfile.");
  process.exit(1);
}

async function promptForGenerator(): Promise<string> {
  console.log("Available generators:\n");
  generatorList.forEach(({ name, description }, i) => {
    console.log(`  ${i + 1}. ${name}  —  ${description}`);
  });
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question("Which generator? ");
  rl.close();
  return answer.trim();
}

function findGeneratorByAnswer(answer: string) {
  const idx = parseInt(answer, 10) - 1;
  if (Number.isNaN(idx)) {
    return generatorList.find((g) => g.name === answer);
  }
  return generatorList[idx];
}

async function chooseGenerator(): Promise<string> {
  if (generatorArg) {
    return generatorArg;
  }

  const answer = await promptForGenerator();
  const chosen = findGeneratorByAnswer(answer);

  if (!chosen) {
    console.error(`Unknown generator: "${answer}"`);
    process.exit(1);
  }

  return chosen.name;
}

const generatorName = await chooseGenerator();
const generator = plop.getGenerator(generatorName);

// ─── Resolve answers ─────────────────────────────────────────────────────────

type Answers = Record<string, string>;
let answers: Answers = {};

if (Object.keys(bypassMap).length > 0) {
  const prompts = generator.prompts as { name?: string; type: string }[];
  const missing = Array.isArray(prompts)
    ? prompts
        .filter((p) => p.name && !(p.name in bypassMap))
        .map((p) => `--${p.name}`)
    : [];

  if (missing.length > 0) {
    console.error(`Missing required flags: ${missing.join(", ")}`);
    process.exit(1);
  }

  answers = bypassMap;
} else {
  answers = await generator.runPrompts().then((r) => r as Answers);
}

// ─── Run actions ─────────────────────────────────────────────────────────────

console.log(`\nRunning generator: ${generatorName}\n`);

const { changes, failures } = await generator.runActions(answers);

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) {
    const path = (f as { path?: string }).path ?? "";
    console.error(` ✗ [${f.type}] ${path}  ${f.error}`);
  }
  process.exit(1);
}

for (const c of changes) {
  const icon = c.type === "add" ? "✅" : "✏️ ";
  console.log(` ${icon} [${c.type}] ${c.path}`);
}
