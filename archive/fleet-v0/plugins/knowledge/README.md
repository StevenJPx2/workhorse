# @workhorse/knowledge

Two corpora on AI Search: what the fleet has done, and what this repo requires.

## Tools

| Tool | What it does |
|---|---|
| `search_fleet_knowledge` | Searches distilled traces from every past run, across every repo. |
| `memory_search` | Searches durable facts about the current repo. |
| `memory_write` | Records one durable fact about the current repo. |

## Routes

`POST /knowledge/search` and `POST /knowledge/reindex`.

## Notes

Memory replaced Magic Context. The old mechanism restored a SQLite database from R2
into every sandbox. A baked 90MB ONNX model indexed it locally. The run then
checkpointed the database and shipped the whole file back out. Per ticket.

It went for two reasons. Workhorse's staging model makes a stage's context fresh by
design, so the long-conversation memory Magic Context provides has no consumer. And
the round trip cost I/O proportional to the repo's whole memory rather than to what
the run needed.

A memory commits on write. A fact recorded in an early stage is searchable in a
later one, in the same run.

A `mem/<repo>/` filename prefix scopes each memory, and retrieval filters on the repo
attribute. Both use `repoSlug` from `@workhorse/api`, so every spelling of a clone
URL reaches the same memories.

Run traces are distilled before indexing. Indexing raw traces would store the
agent's whole transcript, and retrieval would return noise.

## Tests

`bunx vitest run plugins/knowledge`
