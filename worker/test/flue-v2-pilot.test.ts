import { fakeCore, fakeEnv, fakeSandbox, type FakeSandbox } from "@workhorse/test-utils/tools";
import { toolContext } from "../../packages/server/src/tool-context";
import { writer } from "../../workflows/coding/agents/writer";
import * as v from "valibot";
import {
  createSandboxSessionEnv,
  defineTool,
  init,
  useAgentFinish,
  useModel,
  useSandbox,
  useTool,
} from "@flue/runtime-v2";
import { start } from "@flue/runtime-v2/node";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";

const STAGE_DIR = "/workspace/.workflow/pilot/stages/pr-write/round-1";

type V2Tool = Parameters<typeof useTool>[0];

interface PilotState {
  sandbox: FakeSandbox;
  reads: string[];
  modelTools: string[];
  finishChecks: number;
  appendedSignals: string[];
}

function makeSandbox(state: PilotState) {
  const api = {
    async readFile(path: string) {
      state.reads.push(path);
      const content = await state.sandbox.readFile(path);
      if (content == null) throw new Error(`missing file: ${path}`);
      return content;
    },

    async readFileBuffer(path: string) {
      return new TextEncoder().encode(await api.readFile(path));
    },

    async writeFile(path: string, content: string | Uint8Array) {
      await state.sandbox.writeFile(path, typeof content === "string" ? content : new TextDecoder().decode(content));
    },

    async stat(path: string) {
      const isFile = state.sandbox.files.has(path);
      let isDirectory = false;
      if (!isFile) {
        for (const file of state.sandbox.files.keys()) {
          if (file.startsWith(`${path}/`)) {
            isDirectory = true;
            break;
          }
        }
      }
      return { isFile, isDirectory };
    },

    async readdir(path: string) {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const file of state.sandbox.files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const slash = rest.indexOf("/");
        names.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      return [...names];
    },

    async exists(path: string) {
      if (state.sandbox.files.has(path)) return true;
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [...state.sandbox.files.keys()].some((file) => file.startsWith(prefix));
    },

    async mkdir() {},

    async rm(path: string) {
      for (const file of state.sandbox.files.keys()) {
        if (file === path || file.startsWith(`${path}/`)) state.sandbox.files.delete(file);
      }
    },

    async exec(command: string, options?: { timeoutMs?: number; signal?: AbortSignal }) {
      return state.sandbox.exec(command, { timeout: options?.timeoutMs });
    },
  };

  return {
    createSessionEnv: async () => createSandboxSessionEnv(api, "/workspace/repo"),
    tools: () => [],
  };
}

function adaptWorkhorseTool(tool: ReturnType<typeof writer.tools>[number], context: ReturnType<typeof toolContext>): V2Tool {
  return defineTool({
    name: tool.name,
    description: tool.description,
    input: tool.input,
    async run({ data, signal }) {
      const output = await tool.run({ input: data, signal, ...context });
      return typeof output === "string" ? output : { output };
    },
  });
}

function makeSubmitWork(state: PilotState) {
  return defineTool({
    name: "submit_work",
    description: "Submit the completed stage analysis and control data.",
    input: v.object({
      control: v.object({}),
      analysis: v.string(),
    }),
    run({ data }: { data: { control: Record<string, never>; analysis: string } }) {
      state.sandbox.files.set(`${STAGE_DIR}/control.json`, JSON.stringify(data.control));
      state.sandbox.files.set(`${STAGE_DIR}/analysis.md`, data.analysis);
      return { output: "Work submitted.", terminate: true };
    },
  });
}

describe("Flue v2 stage pilot", () => {
  let runtime: Awaited<ReturnType<typeof start>> | undefined;

  afterEach(async () => {
    await runtime?.stop();
    runtime = undefined;
  });

  it("runs the real Workhorse writer through v2 hooks and preserves artifacts", async () => {
    const state: PilotState = {
      sandbox: fakeSandbox({
        files: {
          "/workspace/repo/README.md": "# Pilot\n\nThis is the repository context.",
        },
      }),
      reads: [],
      modelTools: [],
      finishChecks: 0,
      appendedSignals: [],
    };
    const env = fakeEnv();
    const workhorseSandbox = {
      ...state.sandbox,
      async readFile(path: string) {
        state.reads.push(path);
        return state.sandbox.readFile(path);
      },
    };
    const context = toolContext(
      env,
      fakeCore(),
      "https://worker.test",
      workhorseSandbox,
      { id: "ticket-pilot", repo: "https://github.com/acme/widgets.git", stage: "pr-write" },
      { dir: STAGE_DIR, writeAllow: ["\u0000never"] },
    );
    const tools = writer.tools({ input: { uiChanges: false } }).map((factory) => adaptWorkhorseTool(factory(context), context));
    const submitWork = makeSubmitWork(state);
    const sandbox = makeSandbox(state);

    function FlueV2WriterPilot() {
      useModel("faux/faux-1");
      useSandbox(sandbox, { cwd: "/workspace/repo" });
      for (const tool of tools) useTool(tool);
      useTool(submitWork);
      useAgentFinish(({ response, append }) => {
        state.finishChecks++;
        const submitted = response.toolCalls.some((call) => call.tool === "submit_work" && !call.isError);
        if (!submitted) {
          const signal = "workhorse.submit_required";
          state.appendedSignals.push(signal);
          append({ kind: "signal", type: signal, body: "Call submit_work with the final stage artifacts." });
        }
      });
      return writer.instructions;
    }

    const faux = fauxProvider();
    faux.setResponses([
      (context) => {
        state.modelTools = (context.tools ?? []).map((tool) => tool.name);
        return fauxAssistantMessage(fauxToolCall("read", { path: "README.md" }), { stopReason: "toolUse" });
      },
      fauxAssistantMessage("I have enough context and will finish now."),
      fauxAssistantMessage(
        fauxToolCall("submit_work", {
          control: {},
          analysis: "The pilot writer read the repository context and produced this body.",
        }),
        { stopReason: "toolUse" },
      ),
    ]);

    runtime = await start({ agents: [FlueV2WriterPilot], providers: [faux.provider] });
    const handle = init(FlueV2WriterPilot, { id: "ticket-pilot" });
    const receipt = await handle.dispatch("Write the PR body for the completed change.");
    const reply = await handle.read(receipt);
    const replay = await handle.read(receipt);

    expect(reply.text).toBe("I have enough context and will finish now.");
    expect(replay.text).toBe(reply.text);
    expect(state.reads).toContain("README.md");
    expect(state.modelTools).toContain("submit_work");
    expect(state.modelTools).not.toContain("edit");
    expect(state.modelTools).not.toContain("write");
    expect(state.sandbox.files.get(`${STAGE_DIR}/control.json`)).toBe("{}");
    expect(state.sandbox.files.get(`${STAGE_DIR}/analysis.md`)).toContain("produced this body");
    expect(state.finishChecks).toBe(2);
    expect(state.appendedSignals).toEqual(["workhorse.submit_required"]);
    expect(faux.state.callCount).toBe(3);
    expect(faux.getPendingResponseCount()).toBe(0);
  });
});
