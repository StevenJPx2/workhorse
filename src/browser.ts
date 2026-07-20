// Browser plane (Worker half).
//
// One tiered fetch with automatic escalation:
//   Tier 1 — Cloudflare Browser Rendering binding (real headless Chrome).
//            Beats most of the web, including soft/monitor-mode bot walls.
//   Tier 2 — pluggable commercial unblocker (residential/mobile IP rotation
//            + challenge solving), activated only when a credential is set.
//
// Why tiered (empirically established 2026-07-20): Browser Rendering injects
// non-removable, signed bot-auth headers + published bot-detection IDs, and
// runs from datacenter IPs. It sails past soft walls (hannaandersson.com →
// full content) but is hard-denied by strict PerimeterX/DataDome/Akamai
// deployments (talbots.com) — which also deny a real headed browser on a
// residential IP. Hard walls are an economic problem, not a code one, so we
// escalate to the same class of service the anti-bot industry sells against.
// Until an unblocker credential is configured, hard sites report an honest
// "blocked" rather than pretending.
//
// The unblocker is a URL template so any provider fits with zero code change:
//   UNBLOCKER_URL = "https://api.scraperapi.com/?api_key={KEY}&url={URL}&render=true"
// {URL} is percent-encoded, {KEY} is substituted raw. The credential never
// leaves the Worker plane (mirrors GITHUB_TOKEN custody).

import puppeteer from "@cloudflare/puppeteer";
import type { Env } from "./types";

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
  /** Force the unblocker tier (skip Browser Rendering). */
  forceUnblocker?: boolean;
}

export interface BrowserFetchResult {
  url: string;
  finalUrl?: string;
  mode: BrowserMode;
  ok: boolean;
  /** "browser-rendering" | "unblocker" | "none". */
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
  // PerimeterX / HUMAN Security.
  if (
    h.includes("access to this page has been denied") ||
    h.includes("px-captcha") ||
    u.includes("/px-show") ||
    h.includes("perimeterx") ||
    h.includes("_pxhd")
  )
    return "PerimeterX/HUMAN";
  // DataDome.
  if (h.includes("datadome") || u.includes("geo.captcha-delivery.com") || h.includes("dd-captcha"))
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

/** Tier 2: pluggable commercial unblocker (only if a credential is configured). */
async function viaUnblocker(env: Env, req: BrowserFetchRequest): Promise<BrowserFetchResult> {
  const mode = req.mode ?? "text";
  const tmpl = env.UNBLOCKER_URL;
  const key = env.UNBLOCKER_KEY ?? "";
  if (!tmpl) {
    return {
      url: req.url,
      mode,
      ok: false,
      tier: "none",
      blockedBy: null,
      note: "unblocker not configured (set UNBLOCKER_URL + UNBLOCKER_KEY to fetch hard bot-walled sites)",
    };
  }
  const endpoint = tmpl.replace(/\{URL\}/g, encodeURIComponent(req.url)).replace(/\{KEY\}/g, key);
  const resp = await fetch(endpoint, { headers: { "user-agent": UA } });
  const status = resp.status;
  const html = await resp.text();
  const blockedBy = detectBlock(status, html, req.url);
  if (!resp.ok || blockedBy) {
    return { url: req.url, mode, ok: false, tier: "unblocker", status, blockedBy: blockedBy ?? "generic-block", note: "unblocker could not retrieve the page" };
  }
  if (mode === "html") return { url: req.url, mode, ok: true, tier: "unblocker", status, content: html, bytes: html.length };
  if (mode === "links") {
    const links = [...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]))].slice(0, 500);
    return { url: req.url, mode, ok: true, tier: "unblocker", status, links, bytes: links.join("\n").length };
  }
  const content = stripHtml(html);
  return { url: req.url, mode, ok: true, tier: "unblocker", status, content, bytes: content.length };
}

/**
 * Tiered browser fetch: Browser Rendering first, escalate to the unblocker
 * when the page is bot-walled (or when forced). Screenshots are only
 * available on the Browser Rendering tier.
 */
export async function browserFetch(env: Env, req: BrowserFetchRequest): Promise<BrowserFetchResult> {
  if (!/^https?:\/\//i.test(req.url)) {
    return { url: req.url, mode: req.mode ?? "text", ok: false, tier: "none", note: "url must be http(s)" };
  }
  if (req.forceUnblocker) return viaUnblocker(env, req);

  let first: BrowserFetchResult;
  try {
    first = await viaBrowserRendering(env, req);
  } catch (e) {
    first = {
      url: req.url,
      mode: req.mode ?? "text",
      ok: false,
      tier: "browser-rendering",
      note: `browser rendering error: ${String(e).slice(0, 200)}`,
    };
  }
  if (first.ok) return first;

  // Escalate blocks (and browser-rendering errors) to the unblocker tier.
  if (first.blockedBy || first.note?.startsWith("browser rendering error")) {
    const second = await viaUnblocker(env, req).catch((e) => null);
    if (second && second.ok) return { ...second, note: `escalated from ${first.tier} (${first.blockedBy ?? "error"})` };
    // Neither tier worked — return the most informative failure.
    if (second && second.tier !== "none") return second;
    return {
      ...first,
      note:
        first.blockedBy && !env.UNBLOCKER_URL
          ? `blocked by ${first.blockedBy}; configure UNBLOCKER_URL + UNBLOCKER_KEY to fetch hard bot-walled sites`
          : first.note,
    };
  }
  return first;
}
