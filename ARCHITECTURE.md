# Architecture

Workhorse is simple and runs on open standards; much like [fx.sh](https://fx.sh).

Workhorse will be the light base on which everything else will use.
It is entirely pluggable.

Harnesses can be built on top of workhorse:

- Equestrian - Human driven harness; have a two agent system; one for the user to use,
  - a supervisor agent to do housekeeping like memory, paper-cut measurements, approvals, steering, etc.
- Stable - Completely automated harness; no human involvement, supervisor and coordinator agents are built in.
- Mule - Everyday harness; one-off questions, knowledge retrieval, etc. Basically like Gemini or a chatbot.
- Polo - Claw-like agent; a single agent that can do everything. Use phone, chat, email, etc. Avoids chat interfaces for gen UIs.

I have a different understanding of all the current open standards:

- MCPs
- Skills
- Tool Calling
- Compaction
- Prompt caching
- Subagents

Extra capabilities

- Sandboxing
- Extensibility
- Tasks
- Steering

## MCPs

The current spec adds three capabilities to the application: prompts, resources, tools.

All MCPs must attach to a single server that provides the access that the service asks for.  
This gives natural sandboxing.

We use the extension capabilities of MCP to add `json-render` for generic generative UIs. SO we can have the same experience across platforms: web, tui, etc.

MCPs:

- filesystem (tgrep)
- web
- subagents
- rlm

It can be instantiated like this:

```ts
const agent = createAgent({
  mcps: [
    mcp((ctx) => ({
      tools: [ctx.tools.read, ctx.tools.write],
    })),
  ],
});
```

This way we can define what capabilities are available to the agent per MCP.
We do not need to define custom tools.

## Skills

I feel that skills can be consolidated into MCPs via the existing resource using the URI `skill://`.

## Tool Calling

Codemode. Natural sandboxing.

## Compaction

Learn from Codex. We must have multiple compaction strategies.
Magic Context is pretty good.

## Prompt caching

Learn from Codex and Pi.

## Subagents

RLM.

## Extensibility

Every thing must be extendable and hot-reloadable.

## Sandboxing

First class support via always-on daemon.

## Tasks

Background operations that can be run, paused and removed easily.
MCP extension.

## Steering

Deterministic rules that trigger when a certain thing in the context runs.
MCP extension.
