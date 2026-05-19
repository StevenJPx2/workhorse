/**
 * Figma API types used throughout the plugin.
 *
 * Based on the Figma REST API v1.
 * @see https://www.figma.com/developers/api
 *
 * @module workhorse-plugin-figma/types
 */

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/** Credentials stored in keychain for the Figma plugin */
export interface FigmaCredentials {
  /** Figma personal access token */
  accessToken: string;
}

// ---------------------------------------------------------------------------
// Figma file / node
// ---------------------------------------------------------------------------

/** Minimal shape of a Figma file response (GET /v1/files/:key) */
export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  styles: Record<string, FigmaStyle>;
}

/** A node inside a Figma document */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  // Present on FRAME / COMPONENT nodes
  description?: string;
  // Present on TEXT nodes
  characters?: string;
}

/** A component entry in the file-level component map */
export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
}

/** A style entry in the file-level style map */
export interface FigmaStyle {
  key: string;
  name: string;
  description: string;
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** A comment on a Figma file */
export interface FigmaComment {
  id: string;
  /** Full UUID of the thread's root comment. Present when this is a reply. */
  parent_id?: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  user: FigmaUser;
  /** Position on the canvas (absent for replies) */
  client_meta?: FigmaCommentPosition;
  /** Ordered reactions on this comment */
  reactions?: FigmaReaction[];
}

/** Canvas position for a Figma comment */
export interface FigmaCommentPosition {
  node_id?: string;
  node_offset?: { x: number; y: number };
  x?: number;
  y?: number;
}

/** Figma user object */
export interface FigmaUser {
  id: string;
  handle: string;
  img_url: string;
  email?: string;
}

/** A reaction on a Figma comment */
export interface FigmaReaction {
  user: FigmaUser;
  emoji: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Project / team
// ---------------------------------------------------------------------------

/** A Figma project */
export interface FigmaProject {
  id: string;
  name: string;
}

/** An entry in a Figma project's file list */
export interface FigmaProjectFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

// ---------------------------------------------------------------------------
// Parsed reference
// ---------------------------------------------------------------------------

/**
 * A fully-resolved reference to a Figma resource parsed from a URL.
 */
export interface FigmaRef {
  /** Figma file key (the opaque ID in the URL) */
  fileKey: string;
  /** Optional node ID (for links that anchor to a specific frame/component) */
  nodeId?: string;
  /** Human-readable file/node name, if available */
  displayName?: string;
  /** Canonical URL for the file (or node) */
  url: string;
}
