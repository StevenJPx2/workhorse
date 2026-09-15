// The evlog instance and its Workers configuration.

// `log` is the root export; only the init/adapter helpers live under /workers.
import { log } from "evlog";
import { initWorkersLogger } from "evlog/workers";

/**
 * Configure logging for the Worker. Call once at module scope, before the
 * default export is constructed.
 *
 * `stringify: false` because Cloudflare's log pipeline stores an OBJECT and
 * indexes its fields; handing it a JSON string makes every field a substring of
 * one blob, which is exactly what structured logging is meant to avoid.
 */
export function initLogging(options: { service?: string; environment?: string } = {}): void {
  initWorkersLogger({
    env: {
      service: options.service ?? "workhorse",
      environment: options.environment ?? "production",
    },
    stringify: false,
  });
}

export { log };
