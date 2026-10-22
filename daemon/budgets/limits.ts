// The lightness budgets this job gates (docs/architecture.md, "Budgets"). Limits only tighten.
// `undefined` means "not set yet": the job reports the measurement without failing, and the first
// measurement on the CI runner becomes the limit (for budgets added by later slices).

export type Budget = {
  readonly name: string;
  readonly unit: "MB" | "ms" | "KB";
  readonly limit: { readonly darwin: number | undefined; readonly linux: number | undefined };
};

export const BUDGETS = {
  linkMemory: {
    name: "additional private memory per accepted link",
    unit: "MB",
    limit: { darwin: 1, linux: 1 },
  },
  // Memory the idle daemon wrote: Linux Private_Dirty, macOS phys_footprint. Not RSS: resident
  // pages of the 140 MB workerd binary are file-backed and reclaimable, and dominate RSS on Linux.
  privateMemory: {
    name: "daemon idle private memory",
    unit: "MB",
    limit: { darwin: 20, linux: 20 },
  },
  // Process start to the first answered hello, sandbox included, median of the runs. Linux CI
  // runners vary: medians of 37.9 to 56.0 ms over four runs, slowest sample 63.8 ms.
  coldStart: {
    name: "cold start to first answer",
    unit: "ms",
    limit: { darwin: 50, linux: 70 },
  },
  rules: { name: "core (rules) bundle, gzip", unit: "KB", limit: { darwin: 20, linux: 20 } },
  // Slice 1 measured 32.8 KB (mostly Effect). Slice 2's standing link (the Link object, its
  // session, the handshake rules) brought it to 40.9 KB; reset to 42 KB by decision, tighten-only
  // from here. Cold start and idle memory, which users feel, were unchanged by the reset.
  daemonBundle: {
    name: "daemon bundle, gzip",
    unit: "KB",
    limit: { darwin: 42, linux: 42 },
  },
} as const satisfies Record<string, Budget>;
