/**
 * Debug trace helper - writes to temp file for introspection
 */

export const orchestratorTrace = (tid: string, step: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const traceLine = `[${timestamp}] orchestrator[${tid}] ${step}${data ? `: ${JSON.stringify(data)}` : ""}\n`;
  try {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const tracePath = path.join(os.tmpdir(), "jiratown-trace.log");
    fs.appendFileSync(tracePath, traceLine);
  } catch {
    // Silent fail for tracing
  }
  console.log(traceLine.trim());
};