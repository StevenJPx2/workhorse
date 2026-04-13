#!/usr/bin/env bun
/**
 * Live trace monitor for jiratown
 * Watches /tmp/jiratown-trace.log and outputs new entries immediately
 */

import { watch } from "fs";
import { createReadStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TRACE_FILE = join(tmpdir(), "jiratown-trace.log");

console.log("🔍 Live Trace Monitor Started");
console.log(`📁 Watching: ${TRACE_FILE}`);
console.log("⏳ Waiting for traces...\n");

let lastSize = 0;
let _isFirstRead = true;

function readNewContent() {
  try {
    const stream = createReadStream(TRACE_FILE, { start: lastSize });
    let newData = "";

    stream.on("data", (chunk) => {
      newData += chunk;
    });

    stream.on("end", () => {
      if (newData) {
        const lines = newData.split("\n").filter((line) => line.trim());
        for (const line of lines) {
          console.log(line);
        }
      }
    });

    stream.on("error", () => {
      // Silent fail
    });
  } catch {
    // File might not exist yet
  }
}

function getFileSize(): number {
  try {
    const { size } = require("fs").statSync(TRACE_FILE);
    return size;
  } catch {
    return 0;
  }
}

// Initial check
lastSize = getFileSize();

// Watch for changes
watch(TRACE_FILE, (eventType) => {
  if (eventType === "change") {
    const newSize = getFileSize();
    if (newSize > lastSize) {
      readNewContent();
      lastSize = newSize;
    }
  }
});

// Also poll as backup (in case watch misses it)
setInterval(() => {
  const newSize = getFileSize();
  if (newSize > lastSize) {
    readNewContent();
    lastSize = newSize;
  }
}, 500);

// Keep alive
setInterval(() => {
  // Heartbeat to keep process alive
}, 1000);
