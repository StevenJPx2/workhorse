// The lightness budgets this job gates (docs/architecture.md, "Budgets"). Limits only tighten.
// `undefined` means "not set yet": the job reports the measurement without failing, and the first
// measurement on the CI runner becomes the limit.

export type Budget = {
  readonly name: string;
  readonly unit: "MB" | "ms" | "KB";
  readonly limit: { readonly darwin: number | undefined; readonly linux: number | undefined };
};

export const BUDGETS = {
  // Memory the idle daemon itself uses: Linux Private_Clean + Private_Dirty, macOS phys_footprint.
  // Resident pages of the workerd binary are shared and reclaimable, so RSS is reported, not gated.
  privateMemory: {
    name: "daemon idle private memory",
    unit: "MB",
    limit: { darwin: 20, linux: 20 },
  },
  // Process start to the first answered hello, sandbox included, median of the runs.
  coldStart: {
    name: "cold start to first answer",
    unit: "ms",
    limit: { darwin: 50, linux: undefined },
  },
  rules: { name: "core (rules) bundle, gzip", unit: "KB", limit: { darwin: 20, linux: 20 } },
  daemonBundle: {
    name: "daemon bundle, gzip",
    unit: "KB",
    limit: { darwin: undefined, linux: undefined },
  },
} as const satisfies Record<string, Budget>;
