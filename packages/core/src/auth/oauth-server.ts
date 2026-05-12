/**
 * Local OAuth callback server.
 *
 * Spins up a temporary HTTP server to receive OAuth callbacks.
 * Token exchange is handled by Arctic providers.
 *
 * @module @jiratown/core/auth
 */

import type { OAuthProvider, OAuthTokens } from "./types.ts";
import { errorHtml, successHtml } from "./oauth-html.ts";

const DEFAULT_PORT = 9876;
const CALLBACK_PATH = "/callback";

/**
 * Result from the OAuth flow.
 */
export interface OAuthFlowResult {
  success: true;
  tokens: OAuthTokens;
}

export interface OAuthFlowError {
  success: false;
  error: string;
}

export type OAuthResult = OAuthFlowResult | OAuthFlowError;

/**
 * Start the OAuth flow for a provider.
 *
 * Returns the authorization URL to open in the browser and a promise
 * that resolves when the callback is received and tokens are exchanged.
 *
 * @example
 * ```typescript
 * const { authUrl, waitForCallback, cancel } = startOAuthFlow(provider);
 *
 * // Open browser
 * await open(authUrl.toString());
 *
 * // Wait for user to complete auth
 * const result = await waitForCallback;
 * if (result.success) {
 *   // Tokens already saved by the flow
 *   console.log("Authenticated!");
 * }
 * ```
 */
export function startOAuthFlow(provider: OAuthProvider): {
  authUrl: URL;
  state: string;
  waitForCallback: Promise<OAuthResult>;
  cancel: () => void;
} {
  const port = provider.callbackPort ?? DEFAULT_PORT;

  // Get auth URL from provider (Arctic handles state generation)
  const { url: authUrl, state } = provider.createAuthorizationURL();

  let server: ReturnType<typeof Bun.serve> | null = null;
  let resolvePromise: (result: OAuthResult) => void;

  return {
    authUrl,
    state,
    waitForCallback: new Promise<OAuthResult>((resolve) => {
      resolvePromise = resolve;

      server = Bun.serve({
        port,
        async fetch(req) {
          const url = new URL(req.url);

          if (url.pathname !== CALLBACK_PATH) {
            return new Response("Not found", { status: 404 });
          }

          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");
          const errorDescription = url.searchParams.get("error_description");

          // Verify state
          if (url.searchParams.get("state") !== state) {
            resolve({
              success: false,
              error: "State mismatch - possible CSRF attack",
            });
            server?.stop();
            return new Response(errorHtml("State mismatch"), {
              headers: { "Content-Type": "text/html" },
            });
          }

          // Handle error response
          if (error) {
            resolve({
              success: false,
              error: errorDescription || error,
            });
            server?.stop();
            return new Response(errorHtml(errorDescription || error), {
              headers: { "Content-Type": "text/html" },
            });
          }

          // Handle missing code
          if (!code) {
            resolve({
              success: false,
              error: "No authorization code received",
            });
            server?.stop();
            return new Response(errorHtml("No authorization code"), {
              headers: { "Content-Type": "text/html" },
            });
          }

          // Exchange code for tokens using provider (Arctic)
          try {
            const tokens = await provider.validateAuthorizationCode(code);

            // Save tokens
            await provider.saveTokens(tokens);

            resolve({ success: true, tokens });
            server?.stop();
            return new Response(successHtml(), {
              headers: { "Content-Type": "text/html" },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Token exchange failed";
            resolve({ success: false, error: message });
            server?.stop();
            return new Response(errorHtml(message), {
              headers: { "Content-Type": "text/html" },
            });
          }
        },
      });
    }),
    cancel: () => {
      server?.stop();
      resolvePromise?.({ success: false, error: "Cancelled by user" });
    },
  };
}
