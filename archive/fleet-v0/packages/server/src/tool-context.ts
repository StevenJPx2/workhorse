// Assembling a ToolContext for a stage or chat session.
//
// Takes the Core rather than constructing one. Building it here would mean
// importing the Core facade, which reaches chat and tickets — and chat needs to
// build tool contexts, so that closed a loop. A caller that already has `env` can
// get a Core from ./core in one line; a caller that was HANDED one (fleet chat)
// must not be forced to import the facade to use it.

import type { Core, Env, SandboxHandle, ToolContext, WritePolicy } from "@workhorse/api";

/**
 * Build a ToolContext for a stage/chat session from its sandbox + ticket.
 *
 * `policy` is the stage's write gate. It is part of the CONTEXT rather than a
 * parameter to the write tools, because those tools are now ordinary plugin tools
 * assembled like any other — the worker no longer wraps them.
 */
export function toolContext(
  env: Env,
  core: Core,
  selfOrigin: string,
  sandbox: SandboxHandle,
  ticket: { id: string; repo: string; stage: string },
  policy?: WritePolicy,
): ToolContext {
  return { env, core, selfOrigin, sandbox, ticket, policy };
}

