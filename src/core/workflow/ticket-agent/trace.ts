/**
 * Trace utility for ticket agent workflow
 */

export const trace = (tid: string, step: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const traceLine = `[${timestamp}] workflow[${tid}] ${step}${data ? `: ${JSON.stringify(data)}` : ""}\n`;
  try {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const tracePath = path.join(os.tmpdir(), "jiratown-workflow.log");
    fs.appendFileSync(tracePath, traceLine);
  } catch {}
  if (process.env.DEBUG) {
    console.log(traceLine.trim());
  }
};
