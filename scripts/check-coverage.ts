#!/usr/bin/env bun
/**
 * Coverage check script for Jiratown
 * Ensures test coverage meets the 97% threshold
 */

import { spawn } from "child_process";

const COVERAGE_THRESHOLD = 97;

interface CoverageResult {
  lines: number;
  funcs: number;
  passes: boolean;
}

function runTestsWithCoverage(): Promise<CoverageResult> {
  return new Promise((resolve, reject) => {
    const bun = spawn("bun", ["test", "--coverage"], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    bun.stdout?.on("data", (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    bun.stderr?.on("data", (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    bun.on("close", (_code) => {
      // Parse coverage from output (check both stdout and stderr)
      // Look for line like: "All files |  100.00 |  100.00 |"
      const combined = stdout + "\n" + stderr;
      const lines = combined.split("\n");
      let coverageLine: string | null = null;

      for (const line of lines) {
        // Match "All files" line with pipes (coverage table format)
        if (line.trim().startsWith("All files") && line.includes("|")) {
          coverageLine = line;
          break;
        }
      }

      if (!coverageLine) {
        reject(new Error("Could not find coverage summary in test output"));
        return;
      }

      // Extract percentages from the line
      // Format: "All files | % Funcs | % Lines |"
      const parts = coverageLine.split("|").map((p) => p.trim());
      // parts[0] = "All files", parts[1] = "% Funcs", parts[2] = "% Lines"
      const funcsPct = parseFloat(parts[1]?.replace(/%/g, "") || "0");
      const linesPct = parseFloat(parts[2]?.replace(/%/g, "") || "0");

      resolve({
        lines: linesPct,
        funcs: funcsPct,
        passes: linesPct >= COVERAGE_THRESHOLD,
      });
    });

    bun.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log("🔍 Checking test coverage...");
  console.log(`   Threshold: ${COVERAGE_THRESHOLD}% line coverage\n`);

  try {
    const result = await runTestsWithCoverage();

    console.log("\n" + "=".repeat(50));
    console.log(`📊 Line Coverage: ${result.lines.toFixed(2)}%`);
    console.log(`📊 Func Coverage: ${result.funcs.toFixed(2)}%`);
    console.log("=".repeat(50));

    if (result.passes) {
      console.log(`\n✅ Coverage meets the ${COVERAGE_THRESHOLD}% threshold!`);
      process.exit(0);
    } else {
      console.log(
        `\n❌ Coverage (${result.lines.toFixed(2)}%) is below the required ${COVERAGE_THRESHOLD}% threshold!`,
      );
      console.log("   Add more tests to increase coverage.");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 Failed to check coverage:", error);
    process.exit(1);
  }
}

main();
