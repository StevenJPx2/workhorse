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

/** Shape a successful unblocker HTML payload into the requested mode. */
function shapeUnblocker(
  req: BrowserFetchRequest,
  mode: BrowserMode,
  status: number,
  html: string,
  note?: string,
): BrowserFetchResult {
  if (mode === "html")
    return { url: req.url, mode, ok: true, tier: "unblocker", status, content: html, bytes: html.length, note };
  if (mode === "links") {
    const links = [...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]))].slice(0, 500);
    return { url: req.url, mode, ok: true, tier: "unblocker", status, links, bytes: links.join("\n").length, note };
  }
  const content = stripHtml(html);
  return { url: req.url, mode, ok: true, tier: "unblocker", status, content, bytes: content.length, note };
}

interface ScrapflyEnvelope {
  result?: {
    content?: string;
    status_code?: number;
    format?: string;
    error?: { code?: string; message?: string };
  };
  message?: string;
}

/**
 * Scrapfly provider (first-class). Its Anti Scraping Protection (asp=true) is
 * purpose-built for PerimeterX/DataDome/Akamai/Cloudflare: it rotates
 * residential proxies and solves JS/CAPTCHA challenges server-side — the exact
 * capability Browser Rendering structurally cannot have. Returns a JSON
 * envelope with the page in result.content (format=raw). cost_budget caps ASP's
 * dynamic credit escalation; country defaults to us (the hard targets so far
 * are US retailers).
 */
async function viaScrapfly(env: Env, req: BrowserFetchRequest): Promise<BrowserFetchResult> {
  const mode = req.mode ?? "text";
  const key = env.SCRAPFLY_KEY!;
  const params = new URLSearchParams({
    key,
    url: req.url,
    asp: "true",
    render_js: "true",
    format: "raw",
    country: env.SCRAPFLY_COUNTRY || "us",
  });
  if (req.waitMs && req.waitMs > 0) params.set("rendering_wait", String(Math.min(req.waitMs, 8000)));
  if (env.SCRAPFLY_COST_BUDGET) params.set("cost_budget", env.SCRAPFLY_COST_BUDGET);

  const resp = await fetch(`https://api.scrapfly.io/scrape?${params.toString()}`);
  const apiStatus = resp.status;
  const bodyText = await resp.text();
  let envelope: ScrapflyEnvelope;
  try {
    envelope = JSON.parse(bodyText) as ScrapflyEnvelope;
  } catch {
    return { url: req.url, mode, ok: false, tier: "unblocker", status: apiStatus, note: `scrapfly: non-JSON response (HTTP ${apiStatus}) ${bodyText.slice(0, 160)}` };
  }
  const result = envelope.result ?? {};
  const targetStatus = result.status_code ?? apiStatus;
  let html = typeof result.content === "string" ? result.content : "";
  // Large object (>5MB): result.content is an authenticated download URL.
  if (result.format === "clob" && html) {
    try {
      const clobUrl = html;
      const cr = await fetch(`${clobUrl}${clobUrl.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`);
      html = await cr.text();
    } catch {
      return { url: req.url, mode, ok: false, tier: "unblocker", status: targetStatus, note: "scrapfly: large-object fetch failed" };
    }
  }
  if (apiStatus >= 400 || !html) {
    const reject = resp.headers.get("x-scrapfly-reject-code") || result.error?.code || envelope.message;
    return {
      url: req.url,
      mode,
      ok: false,
      tier: "unblocker",
      status: targetStatus,
      blockedBy: "unblocker-failed",
      note: `scrapfly could not retrieve the page (HTTP ${apiStatus}${reject ? `, ${reject}` : ""})`,
    };
  }
  const blockedBy = detectBlock(targetStatus, html, req.url);
  if (blockedBy) {
    return { url: req.url, mode, ok: false, tier: "unblocker", status: targetStatus, blockedBy, note: `scrapfly ASP did not defeat ${blockedBy}` };
  }
  const cost = resp.headers.get("x-scrapfly-api-cost");
  return shapeUnblocker(req, mode, targetStatus, html, cost ? `scrapfly asp+js, ${cost} credits` : "scrapfly asp+js");
}

/** Generic template provider (ScraperAPI-style raw-HTML proxies). */
async function viaGenericUnblocker(env: Env, req: BrowserFetchRequest): Promise<BrowserFetchResult> {
  const mode = req.mode ?? "text";
  const tmpl = env.UNBLOCKER_URL!;
  const key = env.UNBLOCKER_KEY ?? "";
  const endpoint = tmpl.replace(/\{URL\}/g, encodeURIComponent(req.url)).replace(/\{KEY\}/g, key);
  const resp = await fetch(endpoint, { headers: { "user-agent": UA } });
  const status = resp.status;
  const html = await resp.text();
  const blockedBy = detectBlock(status, html, req.url);
  if (!resp.ok || blockedBy) {
    return { url: req.url, mode, ok: false, tier: "unblocker", status, blockedBy: blockedBy ?? "generic-block", note: "unblocker could not retrieve the page" };
  }
  return shapeUnblocker(req, mode, status, html);
}

/**
 * Tier 2: pluggable commercial unblocker. Scrapfly is the first-class provider
 * (just set SCRAPFLY_KEY); UNBLOCKER_URL is a generic template fallback for any
 * other raw-HTML proxy. Neither configured => hard sites report an honest block.
 */
async function viaUnblocker(env: Env, req: BrowserFetchRequest): Promise<BrowserFetchResult> {
  if (env.SCRAPFLY_KEY) return viaScrapfly(env, req);
  if (env.UNBLOCKER_URL) return viaGenericUnblocker(env, req);
  return {
    url: req.url,
    mode: req.mode ?? "text",
    ok: false,
    tier: "none",
    blockedBy: null,
    note: "unblocker not configured (set SCRAPFLY_KEY, or UNBLOCKER_URL + UNBLOCKER_KEY)",
  };
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

  // Screenshots only exist on the Browser Rendering tier (the unblocker
  // returns HTML), so a blocked screenshot cannot escalate — report honestly.
  if ((req.mode ?? "text") === "screenshot") return first;

  const unblockerConfigured = !!env.SCRAPFLY_KEY || !!env.UNBLOCKER_URL;
  // Escalate blocks (and browser-rendering errors) to the unblocker tier.
  if (first.blockedBy || first.note?.startsWith("browser rendering error")) {
    const second = await viaUnblocker(env, req).catch(() => null);
    if (second && second.ok) return { ...second, note: `escalated from ${first.tier} (${first.blockedBy ?? "error"})` };
    // Neither tier worked — return the most informative failure.
    if (second && second.tier !== "none") return second;
    return {
      ...first,
      note:
        first.blockedBy && !unblockerConfigured
          ? `blocked by ${first.blockedBy}; set SCRAPFLY_KEY to fetch hard bot-walled sites`
          : first.note,
    };
  }
  return first;
}
