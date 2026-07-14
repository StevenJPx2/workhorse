// Server-side proxy helpers: the UI's browser code only ever talks to these
// Nuxt server routes; the Workhorse bearer token stays on the server.

import type { H3Event } from "h3";

export async function workhorse(event: H3Event, path: string, init?: RequestInit): Promise<unknown> {
  const config = useRuntimeConfig(event);
  // Same-account Worker→Worker calls must go through the service binding
  // (public workers.dev fetch returns error 1042). Fall back to plain fetch
  // in local dev where the binding doesn't exist.
  const binding = (event.context?.cloudflare as { env?: { WORKHORSE?: Fetcher } } | undefined)
    ?.env?.WORKHORSE;
  const doFetch = binding ? binding.fetch.bind(binding) : fetch;
  const res = await doFetch(`${config.workhorseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.workhorseToken}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  } as RequestInit);
  const text = await res.text();
  if (!res.ok) {
    throw createError({ statusCode: res.status, statusMessage: text.slice(0, 300) });
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
