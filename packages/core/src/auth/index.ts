/**
 * Authentication module for Jiratown plugins.
 *
 * Provides types and utilities for plugin authentication:
 * - OAuth 2.0 flow with local callback server (using Arctic)
 * - External CLI delegation
 * - Auth status checking
 *
 * @module @jiratown/core/auth
 */

export type {
  AuthProvider,
  AuthProviderType,
  AuthStatus,
  ExternalAuthConfig,
  ExternalProvider,
  NoAuthProvider,
  OAuthProvider,
  OAuthTokens,
} from "./types.ts";

export {
  startOAuthFlow,
  type OAuthFlowError,
  type OAuthFlowResult,
  type OAuthResult,
} from "./oauth-server.ts";

// Re-export Arctic utilities for plugin authors
export { generateState } from "arctic";
