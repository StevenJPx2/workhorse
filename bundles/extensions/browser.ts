// Pi extension: Workhorse browser tools (sandbox half).
//
// Gives a workflow agent the ability to read live web pages through the
// Workhorse browser plane — a tiered fetch that runs Cloudflare Browser
// Rendering first and auto-escalates bot-walled sites (PerimeterX/DataDome/
// Akamai) to a commercial unblocker when one is configured. The heavy
// lifting + any unblocker credential live in the Worker; this half is a thin
// authenticated client, so untrusted repo code never sees provider secrets.
//
// Tools:
//   browser_fetch      — fetch a URL as clean text (default), html, or links
//   browser_screenshot — capture a PNG of a URL (Browser Rendering tier only)
//
// Gating: these are custom tools, so a workflow stage must name them in its
// tools[] WITH an object-spec classification ("read-only") or pi-workflow
// blocks them. Off by default in every stage.
//
// Config (first hit wins): env WORKHORSE_BROWSER_URL / WORKHORSE_BROWSER_TOKEN,
// else /root/.workhorse-browser.json { "url": "...", "token": "..." } written
// into the sandbox at prepare time.

import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

function config(): { url: string; token: string } {
  let url = process.env.WORKHORSE_BROWSER_URL ?? "";
  let token = process.env.WORKHORSE_BROWSER_TOKEN ?? "";
  if (!url || !token) {
    try {
      const f = JSON.parse(readFileSync("/root/.workhorse-browser.json", "utf8"));
      url ||= f.url ?? "";
      token ||= f.token ?? "";
    } catch {
      /* fall through */
    }
  }
  return { url: url.replace(/\/$/, ""), token };
}

interface BrowserResult {
  ok: boolean;
  tier: string;
  status?: number;
  finalUrl?: string;
  blockedBy?: string | null;
  content?: string;
  links?: string[];
  base64Image?: string;
  bytes?: number;
  note?: string;
}

async function callBrowser(body: unknown): Promise<BrowserResult> {
  const { url, token } = config();
  if (!url || !token) {
    throw new Error(
      "Browser plane not configured (WORKHORSE_BROWSER_URL/TOKEN or /root/.workhorse-browser.json).",
    );
  }
  const res = await fetch(`${url}/browser`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: BrowserResult;
  try {
    parsed = JSON.parse(text) as BrowserResult;
  } catch {
    throw new Error(`browser plane: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return parsed;
}

const textResult = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "browser_fetch",
    label: "Browser: fetch page",
    description:
      "Fetch a live web page through a real headless browser (renders JS). Returns clean " +
      "visible text by default — use mode 'html' for raw HTML or 'links' for all hyperlinks. " +
      "Automatically escalates bot-protected sites (PerimeterX/DataDome/Akamai) to an " +
      "unblocker backend when one is configured; otherwise reports which vendor blocked it. " +
      "Use for reading docs, verifying deployed pages, extracting content, or research.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute http(s) URL to fetch" }),
      mode: Type.Optional(
        Type.Union([Type.Literal("text"), Type.Literal("html"), Type.Literal("links")], {
          description: "text (clean visible text, default) | html (raw) | links (all hrefs)",
        }),
      ),
      waitMs: Type.Optional(
        Type.Number({ description: "Extra settle time after load (ms) for JS-heavy pages, max 8000" }),
      ),
    }),
    async execute(_id, params) {
      const r = await callBrowser({ url: params.url, mode: params.mode ?? "text", waitMs: params.waitMs });
      if (!r.ok) {
        const why = r.blockedBy
          ? `blocked by ${r.blockedBy}`
          : (r.note ?? `failed (tier ${r.tier}, status ${r.status ?? "n/a"})`);
        return textResult(`Could not fetch ${params.url}: ${why}.`);
      }
      const head = `[${params.url}] via ${r.tier}${r.finalUrl && r.finalUrl !== params.url ? ` → ${r.finalUrl}` : ""} (${r.bytes ?? 0} bytes)`;
      if (params.mode === "links") {
        return textResult(`${head}\n\n${(r.links ?? []).join("\n")}`);
      }
      return textResult(`${head}\n\n${r.content ?? "(empty)"}`);
    },
  });

  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser: screenshot",
    description:
      "Capture a PNG screenshot of a live web page (Browser Rendering tier only). Returns the " +
      "image for visual inspection — e.g. checking a deployed/preview UI actually renders " +
      "correctly. Not available for hard bot-walled sites that require the unblocker tier.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute http(s) URL to screenshot" }),
      waitMs: Type.Optional(Type.Number({ description: "Settle time after load (ms), max 8000" })),
    }),
    async execute(_id, params) {
      const r = await callBrowser({ url: params.url, mode: "screenshot", waitMs: params.waitMs });
      if (!r.ok || !r.base64Image) {
        const why = r.blockedBy ? `blocked by ${r.blockedBy}` : (r.note ?? "screenshot failed");
        return textResult(`Could not screenshot ${params.url}: ${why}.`);
      }
      return {
        content: [
          { type: "text" as const, text: `Screenshot of ${params.url} (${r.bytes ?? 0} bytes):` },
          { type: "image" as const, data: r.base64Image, mimeType: "image/png" },
        ],
        details: {},
      };
    },
  });
}
