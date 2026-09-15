# @workhorse/paste

Turns text into a URL that `curl` can read.

## Tools

`upload_text` — uploads through paste.rs, then 0x0.st.

## Notes

This exists for output too large to return through a tool result. A tool result is
bounded, because an unbounded one spends the stage's context on material the agent
may only need a part of.

## Tests

`bunx vitest run plugins/paste`
