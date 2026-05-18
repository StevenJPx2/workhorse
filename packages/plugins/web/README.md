# workhorse-plugin-web

Web operations plugin for Workhorse, powered by [Jina AI](https://jina.ai).

## Features

- **web_read** — Extract clean markdown from any URL (web pages, PDFs)
- **web_search** — Search the web with full content extraction
- **web_screenshot** — Capture screenshots of web pages

## Prerequisites

Install the Jina CLI:

```bash
pip install jina-cli
# or
uv pip install jina-cli
```

Get a Jina API key (free tier available):
- Visit https://jina.ai/?sui=apikey
- Set `JINA_API_KEY` environment variable

## Installation

The plugin is included in Workhorse by default. Enable it in your config:

```toml
[plugins.web]
# Optional: API key (defaults to JINA_API_KEY env var)
# api_key = "your-key-here"

# Warn if jina-cli is not installed (default: true)
warn_if_missing = true
```

## Tools

### web_read

Read a URL and extract clean markdown content.

```typescript
// Read a web page
await tool("web_read", { url: "https://example.com" });

// Read with link/image summaries
await tool("web_read", {
  url: "https://example.com",
  links: true,
  images: true,
});

// Read a PDF
await tool("web_read", { url: "https://arxiv.org/pdf/2301.12345.pdf" });
```

### web_search

Search the web and return results with content.

```typescript
// Basic search
await tool("web_search", { query: "transformer architecture" });

// Search arXiv papers
await tool("web_search", {
  query: "attention mechanism",
  arxiv: true,
  count: 10,
});

// Search with time filter (d=day, w=week, m=month, y=year)
await tool("web_search", {
  query: "AI news",
  time: "d",
});
```

### web_screenshot

Capture a screenshot of a web page.

```typescript
// Get screenshot URL
await tool("web_screenshot", { url: "https://example.com" });

// Save to file
await tool("web_screenshot", {
  url: "https://example.com",
  output: "screenshot.png",
  fullPage: true,
});
```

## Direct CLI Usage

Agents with shell access can use the Jina CLI directly:

```bash
# Read a URL
jina read https://example.com

# Search the web
jina search "transformer models"

# Pipe search results through reranker
jina search "AI" | jina rerank "embeddings"

# Screenshot
jina screenshot https://example.com -o page.png
```

See [jina-ai/cli](https://github.com/jina-ai/cli) for full CLI documentation.

## Why Jina?

The Jina Reader API:
- Converts any URL to clean, LLM-friendly markdown
- Handles JavaScript-rendered pages
- Supports PDFs natively
- Includes image captioning
- Provides structured JSON output
- Works at scale with caching

## License

Apache-2.0
