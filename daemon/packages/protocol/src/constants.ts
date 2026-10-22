// Plain values with no runtime dependencies, so `core` can import them without pulling in Effect.

export const PROTOCOL_VERSION = 1;

export const SUPPORTED_VERSIONS: readonly number[] = [PROTOCOL_VERSION];

// The workerd compatibility date of the daemon and of every app it loads. The CLI writes it into
// the configuration; the daemon passes it to the Worker Loader.
export const COMPATIBILITY_DATE = "2026-10-01";

// `fs.read` refuses larger files with `failed: too_large`, never truncates them. A reply must also
// fit one protocol line.
export const MAX_READ_BYTES = 512 * 1024;

// JSON-RPC's reserved codes, then Workhorse's four outcomes (docs/architecture.md, "Protocol").
export const ErrorCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  denied: -32001,
  failed: -32002,
  unavailable: -32003,
  limited: -32004,
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
