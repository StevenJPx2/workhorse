import { describe, expect, it } from "vitest";

import type { Service } from "../base";
import { context } from "./fixture";

class MinimalService implements Service {
  readonly name = "minimal";

  setup(): void {}

  teardown(): void {}
}

describe("Service", () => {
  it("exposes a stable name", () => {
    expect(new MinimalService().name).toBe("minimal");
  });

  it("defaults setup to a no-op", () => {
    expect(() => new MinimalService().setup(context())).not.toThrow();
  });

  it("defaults teardown to a no-op", () => {
    expect(() => new MinimalService().teardown()).not.toThrow();
  });
});
