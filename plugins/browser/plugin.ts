// Browser plane (Worker half).
//
// Stateless Browser-Rendering route for one-shot fetches (text/html/links/
// screenshot). The stateful tier (persistent sessions, AX snapshots, click/
// fill/record) lives in the sandbox via agent-browser; see extension.ts.
//
// For bot-walled sites the agent uses browser_open (agent-browser handles
// stealth); this route does not escalate.

import puppeteer from "@cloudflare/puppeteer";
import type { Env, WorkhorsePlugin } from "@workhorse/api";

// page.evaluate callbacks are serialized and run in the browser context, where
// DOM globals exist. Declare the minimal shapes we use so this file type-checks
// without adding "dom" to the Worker's lib (which would let real worker code
// reference nonexistent globals like document and crash at runtime). Module-
// scoped: does not leak to other files.
declare const document: {
  body?: { innerText?: string };
  querySelectorAll(selector: string): Iterable<{ href: string }>;
};

export type BrowserMode = "text" | "html" | "screenshot" | "links";

export interface BrowserFetchRequest {
  url: string;
  mode?: BrowserMode;
  /** Extra settle time (ms) after load for JS challenges to resolve. */
  waitMs?: number;
}

export interface BrowserFetchResult {
  url: string;
  finalUrl?: string;
  mode: BrowserMode;
  ok: boolean;
  /** "browser-rendering" | "none". */
  tier: string;
  status?: number;
  /** Detected bot-wall vendor when a block was seen, else null. */
  blockedBy?: string | null;
  /** text/html/links payload (screenshots come back as base64Image). */
  content?: string;
  links?: string[];
  base64Image?: string;
  bytes?: number;
  note?: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Classify a response as a known bot-wall interstitial. Returns the vendor
 * name (for an honest agent-facing message) or null when the content looks
 * like the real page.
 */
export function detectBlock(status: number, html: string, finalUrl: string): string | null {
  const h = html.slice(0, 20000).toLowerCase();
  const u = finalUrl.toLowerCase();
  // PerimeterX / HUMAN Security. Key off block-INTERSTITIAL signals, never the
  // bare vendor name: legit PX-protected pages embed the "perimeterx" sensor
  // script and _px* cookies, so matching those flags real content as a block
  // (empirically: talbots.com home page contains "perimeterx" in 412KB of
  // genuine content). The deny text / captcha element / px-show URL only appear
  // on the actual interstitial.
  if (
    h.includes("access to this page has been denied") ||
    h.includes("using automation tools to browse") ||
    h.includes("px-captcha") ||
    u.includes("/px-show") ||
    u.includes("px-captcha")
  )
    return "PerimeterX/HUMAN";
  // DataDome — same rule: match the captcha-delivery interstitial, not the
  // "datadome" sensor string that legit protected pages embed.
  if (
    u.includes("geo.captcha-delivery.com") ||
    u.includes("captcha-delivery.com") ||
    h.includes("dd-captcha") ||
    (h.includes("datadome") && h.includes("captcha"))
  )
    return "DataDome";
  // Akamai Bot Manager.
  if (
    (h.includes("access denied") && h.includes("reference #")) ||
    u.includes("errors.edgesuite.net")
  )
    return "Akamai";
  // Cloudflare challenge (other sites' zones).
  if (
    h.includes("just a moment") ||
    h.includes("cf-challenge") ||
    h.includes("__cf_chl") ||
    h.includes("challenge-platform")
  )
    return "Cloudflare";
  // Generic hard denials with tiny bodies.
  if ((status === 403 || status === 429) && html.length < 1500) return "generic-block";
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Tier 1: Cloudflare Browser Rendering binding. */
async function viaBrowserRendering(
  env: Env,
  req: BrowserFetchRequest,
): Promise<BrowserFetchResult> {
  const mode = req.mode ?? "text";
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1440, height: 900 });
    const resp = await page.goto(req.url, {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });
    if (req.waitMs && req.waitMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(req.waitMs!, 8000)));
    }
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    const html = await page.content();
    const blockedBy = detectBlock(status, html, finalUrl);

    if (blockedBy) {
      return { url: req.url, finalUrl, mode, ok: false, tier: "browser-rendering", status, blockedBy };
    }

    if (mode === "screenshot") {
      const buf = (await page.screenshot({ type: "png", fullPage: false })) as unknown as Uint8Array;
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      return { url: req.url, finalUrl, mode, ok: true, tier: "browser-rendering", status, base64Image: b64, bytes: buf.byteLength };
    }
    if (mode === "links") {
      const links = (await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]")).map((a) => a.href),
      )) as string[];
      const uniq = [...new Set(links)].slice(0, 500);
      return { url: req.url, finalUrl, mode, ok: true, tier: "browser-rendering", status, links: uniq, bytes: uniq.join("\n").length };
    }
    if (mode === "html") {
      return { url: req.url, finalUrl, mode, ok: true, tier: "browser-rendering", status, content: html, bytes: html.length };
    }
    // text (default): clean visible text is far more token-efficient for agents.
    const text = (await page.evaluate(() => document.body?.innerText ?? "")) as string;
    const content = text.trim() || stripHtml(html);
    return { url: req.url, finalUrl, mode, ok: true, tier: "browser-rendering", status, content, bytes: content.length };
  } finally {
    await browser.close().catch(() => {});
  }
}


/**
 * Browser fetch via Cloudflare Browser Rendering (stateless, single-shot).
 * For persistent sessions, interactive flows, and bot-walled sites use
 * the agent-browser tools (browser_open/snapshot/act/read) instead.
 */
export async function browserFetch(env: Env, req: BrowserFetchRequest): Promise<BrowserFetchResult> {
  if (!/^https?:\/\//i.test(req.url)) {
    return { url: req.url, mode: req.mode ?? "text", ok: false, tier: "none", note: "url must be http(s)" };
  }
  try {
    return await viaBrowserRendering(env, req);
  } catch (e) {
    return {
      url: req.url,
      mode: req.mode ?? "text",
      ok: false,
      tier: "browser-rendering",
      note: `browser rendering error: ${String(e).slice(0, 200)}`,
    };
  }
}

export const browserPlugin: WorkhorsePlugin = {
  id: "browser",

  routes: [
    {
      // Stateless Browser-Rendering fetch. For persistent sessions use the
      // agent-browser sandbox tools (browser_open/snapshot/act) instead.
      method: "POST",
      path: "/browser",
      auth: "scoped",
      async handler(request, env) {
        const body = (await request.json().catch(() => ({}))) as BrowserFetchRequest;
        if (!body.url) return Response.json({ error: "url required" }, { status: 400 });
        const result = await browserFetch(env, body);
        return Response.json(result, { status: result.ok ? 200 : 502 });
      },
    },
  ],
};
