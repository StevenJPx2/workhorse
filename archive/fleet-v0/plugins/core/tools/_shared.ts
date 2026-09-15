// Shared helpers for the core workspace tools.

/** Single-quote a shell argument. */
export const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** Cap tool output so one read cannot flood a stage's context. */
export const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n…(truncated)` : s);
