# @workhorse/auth

Request authorization tiers.

## Exports

| Export | What it does |
|---|---|
| `resolveTiers(env)` | Reads the master and scoped tokens out of `Env`. |
| `permits(auth, tiers, header)` | Answers whether a bearer header satisfies a route's tier. |
| `bearer(header)` | Extracts the token from an `Authorization` header. |
| `safeEqual(a, b)` | Compares two secrets in constant time. |

## Notes

There are three tiers. A `public` route needs no token. A `scoped` route accepts
the sandbox callback token. A `master` route accepts only the fleet token.

`safeEqual` exists because a route compared a bearer token with `===`. That
short-circuits at the first differing byte and leaks how much of a guess was
right.

The model credential no longer lives here: the fleet runs on the opencode-go
subscription key (`OPENCODE_API_KEY`, a Worker secret), injected directly into
the harness. There is no custodian push and no token store.

## Tests

`bunx vitest run packages/auth`
