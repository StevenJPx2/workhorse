// Runs inside the VM: Pi's SDK step by step, printing elapsed time before each step, to
// find where an agent stalls under agentOS.
const began = Date.now();
const step = (label) => console.error(`[${Date.now() - began} ms] ${label}`);

if (process.env.CLI_DISPATCHER === "1") {
  step("setGlobalDispatcher(EnvHttpProxyAgent), as Pi's cli.js does");
  const undici = await import("/opt/agent/node_modules/@mariozechner/pi-coding-agent/node_modules/undici/index.js");
  undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent({ bodyTimeout: 0, headersTimeout: 0 }));
}
step("import");
const pi = await import("/opt/agent/node_modules/@mariozechner/pi-coding-agent/dist/index.js");
step("AuthStorage.create");
const authStorage = pi.AuthStorage.create();
step("ModelRegistry.create");
const modelRegistry = pi.ModelRegistry.create(authStorage);
step("find model");
const model = modelRegistry.getAll().find((each) => each.provider === "broker" && each.id === "fake");
step(`createAgentSession (model ${model?.provider}/${model?.id})`);
const { session } = await pi.createAgentSession({ sessionManager: pi.SessionManager.inMemory(), authStorage, modelRegistry, model });
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") process.stdout.write(event.assistantMessageEvent.delta);
  if (event.type === "tool_execution_start") step(`tool ${event.toolName}`);
});
step("prompt");
await session.prompt("Write the proof file.");
step("done");
