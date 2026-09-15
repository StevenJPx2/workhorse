# @workhorse/search

Web search and page reading.

## Tools

| Tool | What it does |
|---|---|
| `web_search` | Searches the web. It tries jina first, then exa. |
| `web_read` | Reads one page as clean markdown, through the jina reader. |

## Secrets

| Secret | Role |
|---|---|
| `JINA_API_KEY` | Primary |
| `EXA_API_KEY` | Fallback |
| `TAVILY_API_KEY`, `BRAVE_API_KEY` | Further fallbacks |

## Notes

The provider chain matters more than any one provider. A search tool that fails
when one key expires makes a stage fail for a reason unrelated to the work.

`web_read` returns markdown rather than HTML. An agent reasoning over raw HTML
spends context on markup.

## Tests

`bunx vitest run plugins/search`
