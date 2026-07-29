# @workhorse/imgup

Uploads an image and returns a URL that renders inline.

## Tools

`upload_image` — uploads through a host chain and verifies the served result.

## Host chain

imgbb first, then imgbox, pixhost, and catbox. imgbb leads because it is the one
with a configured key.

## Config

| Variable | Purpose |
|---|---|
| `IMGBB_KEY` | The imgbb API key, injected into the container at `/root/.config/imgup/.env`. |
| `WORKHORSE_IMGUP_BIN` | The binary path. The default is `/usr/local/bin/imgup`. |

## Notes

Exit 2 and exit 1 mean different things. Exit 2 is the argument parser rejecting the
command line, which fails identically for every host. Exit 1 is a host rejecting an
accepted upload. Treating both as "the host failed" reports a malformed invocation
as an outage.

The tool verifies the served image rather than trusting the upload response. A host
can answer 200 and serve nothing.

## Tests

```
bunx vitest run plugins/imgup   # mocked
bun run test:contract           # against the real binary
```
