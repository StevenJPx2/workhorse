// Web-search eval fixtures: agent-shaped queries with answer criteria.
// Mined from the kinds of lookups fleet agents actually perform (docs,
// error messages, library research). Extend from real traces: every time
// an agent's web lookup fails in a run, add the query here.

export interface SearchFixture {
  query: string;
  /** Substrings — a good result set mentions at least one (case-insensitive). */
  expectAny: string[];
  /** A domain we'd expect among the top hits (optional, scored softly). */
  expectDomain?: string;
}

export const searchFixtures: SearchFixture[] = [
  {
    query: "cloudflare workers waitForEvent workflow api",
    expectAny: ["waitForEvent", "workflows"],
    expectDomain: "developers.cloudflare.com",
  },
  {
    query: "nuxt useFetch reactive key re-fetch on param change",
    expectAny: ["useFetch", "watch"],
    expectDomain: "nuxt.com",
  },
  {
    query: 'typescript error "TS2769: No overload matches this call" structuredClone workers',
    expectAny: ["overload", "TS2769"],
  },
  {
    query: "vitest mock timers advance setInterval",
    expectAny: ["useFakeTimers", "advanceTimersByTime", "vi.advanceTimers"],
    expectDomain: "vitest.dev",
  },
  {
    query: "git push force-with-lease vs force difference",
    expectAny: ["force-with-lease"],
  },
  {
    query: "sqlite wal checkpoint truncate when to run",
    expectAny: ["wal_checkpoint", "TRUNCATE"],
    expectDomain: "sqlite.org",
  },
  {
    query: "github api create pull request endpoint",
    expectAny: ["/pulls", "pulls"],
    expectDomain: "docs.github.com",
  },
  {
    query: "pnpm workspace protocol workspace:* meaning",
    expectAny: ["workspace:", "workspace protocol"],
    expectDomain: "pnpm.io",
  },
];
