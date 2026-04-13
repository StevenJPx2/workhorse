import { test } from "bun:test";
import { createRoot, createEffect } from "solid-js";

const mockFn = { calls: 0 };

test("effect in async createRoot", async () => {
  mockFn.calls = 0;
  createRoot(async (d) => {
    createEffect(() => {
      mockFn.calls++;
    });
    console.log("before first await, calls:", mockFn.calls);
    await new Promise((r) => setTimeout(r, 5));
    console.log("after 5ms, calls:", mockFn.calls);
    d();
  });
  console.log("after createRoot sync, calls:", mockFn.calls);
  await new Promise((r) => setTimeout(r, 20));
  console.log("after 20ms total, calls:", mockFn.calls);
});
