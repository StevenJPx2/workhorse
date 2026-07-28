// Custody of the fleet's model credential.
//
// The Anthropic OAuth ACCESS token lives in KV under `auth:access`, refreshed by
// an external custodian. The refresh token never enters the worker — sandboxes
// and stages only ever see a short-lived access token.
//
// This exists because five call sites each re-implemented "is the stored token
// usable", and they disagreed: 5-minute runway in one place, 10 in two others,
// and no check at all in a fourth. A stage using the no-check path 401s
// mid-run — the exact failure the checks were meant to prevent.

const KEY = "auth:access";

/** Anthropic OAuth access tokens carry this prefix. */
const OAT_PREFIX = "sk-ant-oat";

/** Minimum runway for a NEW run. A fresh run may take a while; don't start on fumes. */
export const START_RUNWAY_MS = 10 * 60 * 1000;

/** Minimum runway for the NEXT stage of a run already in flight. */
export const STAGE_RUNWAY_MS = 5 * 60 * 1000;

export interface StoredToken {
  access: string;
  /** Epoch ms. ZERO means "custodian pushed without runway info". */
  expires: number;
}

export type TokenState = "missing" | "expired" | "expiring" | "unknown" | "fresh";

export interface TokenHealth {
  present: boolean;
  state: TokenState;
  minutesRemaining: number | null;
  expires: number | null;
}

/** The KV surface this needs — narrower than the full namespace. */
export interface TokenStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export class ModelTokenStore {
  constructor(private readonly kv: TokenStore) {}

  /** The raw stored record, or null when absent or unparseable. */
  async read(): Promise<StoredToken | null> {
    const raw = await this.kv.get(KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as StoredToken;
      return parsed?.access ? parsed : null;
    } catch {
      // Corrupt JSON is indistinguishable from absent for every caller, and
      // throwing here would fail a run for a bad KV write.
      return null;
    }
  }

  /**
   * Store a custodian-pushed token. Rejects anything that is not an OAuth access
   * token, so a mistakenly-pushed refresh token or API key cannot land here.
   */
  async write(token: StoredToken): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token.access?.startsWith(OAT_PREFIX)) {
      return { ok: false, error: "not an oauth access token" };
    }

    await this.kv.put(KEY, JSON.stringify({ access: token.access, expires: token.expires }));
    return { ok: true };
  }

  /**
   * A token with at least `runwayMs` left, or null.
   *
   * A ZERO expiry counts as usable: the custodian pushed without runway info,
   * and refusing would ground the fleet over missing metadata rather than a
   * missing token. Stages re-read this every turn, so rotation is the
   * custodian's job, not a matter of estimating from file times.
   */
  async usable(runwayMs = START_RUNWAY_MS): Promise<string | null> {
    const stored = await this.read();
    if (!stored) return null;
    if (stored.expires > 0 && stored.expires - Date.now() < runwayMs) return null;

    return stored.access;
  }

  /**
   * Health for the operator UI — freshness only, never the token.
   *
   * An expired model credential silently 401s every run, so this is what turns
   * "everything mysteriously fails" into one visible red tile.
   */
  async health(): Promise<TokenHealth> {
    const stored = await this.read();
    if (!stored) return { present: false, state: "missing", minutesRemaining: null, expires: null };

    const { expires } = stored;
    const msLeft = (expires || 0) - Date.now();

    return {
      present: true,
      state: !expires ? "unknown" : msLeft <= 0 ? "expired" : msLeft < START_RUNWAY_MS ? "expiring" : "fresh",
      minutesRemaining: expires ? Math.round(msLeft / 60000) : null,
      expires: expires || null,
    };
  }
}
