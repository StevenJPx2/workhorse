import type { JSX } from "solid-js";
import type { RenderOptions } from "../__tests__/test-helper.tsx";

export interface FrameSpec {
  name: string;
  component: () => JSX.Element;
  options?: RenderOptions;
  interactions?: (
    ctx: Awaited<ReturnType<typeof import("../__tests__/test-helper.tsx").renderWithProviders>>,
  ) => Promise<void>;
}

export const OUT = import.meta.dir + "/../frames";
