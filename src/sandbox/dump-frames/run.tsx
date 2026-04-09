#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { renderWithProviders } from "../__tests__/test-helper.tsx";
import { OUT } from "./types.ts";
import { buttonSpecs } from "./specs-buttons.tsx";
import { fieldSpecs } from "./specs-fields.tsx";
import { overlaySpecs } from "./specs-overlays.tsx";
import { composedSpecs } from "./specs-composed.tsx";
import { stressSpecs } from "./specs-stress.tsx";
import { agentDisplaySpecs } from "./specs-agent-display.tsx";

const specs = [...buttonSpecs, ...fieldSpecs, ...overlaySpecs, ...composedSpecs, ...stressSpecs, ...agentDisplaySpecs];

async function main() {
  mkdirSync(OUT, { recursive: true });

  let count = 0;
  for (const spec of specs) {
    const ctx = await renderWithProviders(spec.component, spec.options);
    if (spec.interactions) {
      await spec.interactions(ctx);
    }
    const frame = ctx.captureCharFrame();
    const path = join(OUT, `${spec.name}.txt`);
    writeFileSync(path, frame);
    count++;
    console.log(`  ✓ ${spec.name}`);
  }

  console.log(`\nDumped ${count} frames to ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});