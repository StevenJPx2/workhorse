/**
 * Plugin authentication provider types.
 *
 * Plugins declare their auth requirements, and the TUI handles
 * the appropriate flow based on the provider type.
 *
 * Uses Arctic for OAuth providers.
 *
 * @module workhorse-core/auth
 */

/**
 * Standard OAuth token response.
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
}

/**
 * External auth configuration for plugins that delegate to CLI tools.
 */
export interface ExternalAuthConfig {
  /** Command to run for authentication (e.g., "gh auth login") */
  authCommand: string;
  /** Command to check auth status (e.g., "gh auth status") */
  statusCommand: string;
  /** Human-readable instructions for the user */
  instructions: string;
}

/**
 * Auth provider types supported by Workhorse.
 */
export type AuthProviderType = "oauth" | "external" | "apitoken" | "none";

/**
 * OAuth auth provider - TUI handles the full OAuth flow using Arctic.
 *
 * Plugins provide an Arctic OAuth client instance and callbacks for token storage.
 */
export interface OAuthProvider {
  type: "oauth";
  /**
   * Create authorization URL and state.
   * Called when user initiates auth flow.
   */
  createAuthorizationURL: () => { url: URL; state: string };
  /**
   * Exchange authorization code for tokens.
   * Called after OAuth callback is received.
   */
  validateAuthorizationCode: (code: string) => Promise<OAuthTokens>;
  /**
   * Refresh an expired access token.
   * Optional - not all providers support refresh tokens.
   */
  refreshAccessToken?: (refreshToken: string) => Promise<OAuthTokens>;
  /** Check if already authenticated */
  isAuthenticated: () => Promise<boolean>;
  /** Save tokens after successful OAuth */
  saveTokens: (tokens: OAuthTokens) => Promise<void>;
  /** Clear stored tokens */
  clearTokens: () => Promise<void>;
  /** Optional: Load existing tokens */
  loadTokens?: () => Promise<OAuthTokens | null>;
  /** Local callback port (default: 9876) */
  callbackPort?: number;
}

/**
 * External auth provider - delegates to external CLI tool.
 */
export interface ExternalProvider {
  type: "external";
  config: ExternalAuthConfig;
  /** Check if already authenticated */
  isAuthenticated: () => Promise<boolean>;
}

/**
 * API Token auth field definition for setup wizard.
 */
export interface ApiTokenAuthField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  /** If true, mask input (for API tokens, passwords) */
  secret?: boolean;
  placeholder?: string;
}

/**
 * API Token auth provider - user provides credentials via setup wizard.
 * Used for services that use API tokens (like Jira, Linear, etc.)
 */
export interface ApiTokenProvider {
  type: "apitoken";
  /** Check if already authenticated */
  isAuthenticated: () => Promise<boolean>;
  /** Get fields to display in setup wizard */
  getFields: () => ApiTokenAuthField[];
  /** Configure auth with user-provided values */
  configure: (values: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  /** Clear stored credentials */
  clearTokens: () => Promise<void>;
}

/**
 * No auth required.
 */
export interface NoAuthProvider {
  type: "none";
}

/**
 * Union of all auth provider types.
 */
export type AuthProvider = OAuthProvider | ExternalProvider | ApiTokenProvider | NoAuthProvider;

/**
 * Auth status for a plugin.
 */
export interface AuthStatus {
  pluginName: string;
  authenticated: boolean;
  provider: AuthProviderType;
  /** Error message if auth check failed */
  error?: string;
}
