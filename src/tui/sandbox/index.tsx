#!/usr/bin/env bun
/**
 * Sandbox entry point
 *
 * Run with: bun run sandbox
 */

import { render } from "@opentui/solid";
import { SandboxApp } from "./sandbox-app/index.ts";

render(() => <SandboxApp />);
