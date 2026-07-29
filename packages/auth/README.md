# @workhorse/auth

Request authorization and model-token custody.

Five call sites used to check tokens, and they disagreed on how. This package
holds one implementation of each check, so a route and a sandbox callback cannot
drift apart.

## Exports

| Export | What it does |
|---|---|
| `resolveTiers(env)` | Reads the master and scoped tokens out of `Env`. |
| `permits(auth, tiers, header)` | Answers whether a bearer header satisfies a route's tier. |
| `bearer(header)` | Extracts the token from an `Authorization` header. |
| `safeEqual(a, b)` | Compares two secrets in constant time. |
| `modelToken(env)` | Returns the model-token store for this env, memoized. |
| `ModelTokenStore` | Reads, writes, and reports the freshness of the Anthropic access token. |
| `START_RUNWAY_MS`, `STAGE_RUNWAY_MS` | How much token life a run needs to start, and a stage needs to continue. |

## Notes

There are three tiers. A `public` route needs no token. A `scoped` route accepts
the sandbox callback token. A `master` route accepts only the fleet token.

`safeEqual` exists because a route compared a bearer token with `===`. That
short-circuits at the first differing byte and leaks how much of a guess was
right.

The store never refreshes a token. An external custodian holds the OAuth refresh
token and pushes short-lived access tokens to `POST /token`. The Worker only
reads. A revoked refresh token needs an interactive login on the custodian host,
and no code in this repo can fix it.

## Tests

`bunx vitest run packages/auth`
