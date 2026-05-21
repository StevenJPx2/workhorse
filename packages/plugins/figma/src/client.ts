/**
 * Figma REST API client.
 *
 * Wraps the Figma v1 REST API using a personal access token (PAT).
 * All methods throw on non-2xx responses.
 *
 * @module workhorse-plugin-figma/client
 */
import type {
  FigmaComment,
  FigmaCredentials,
  FigmaFile,
  FigmaProject,
  FigmaProjectFile,
} from "./types.ts";

const FIGMA_API_BASE = "https://api.figma.com/v1";

/** Getter that resolves the Figma credentials at call time (lazy, supports rotation) */
export type FigmaCredentialGetter = () => Promise<FigmaCredentials>;

/** Thin Figma REST API client */
export class FigmaClient {
  constructor(private readonly getCredentials: FigmaCredentialGetter) {}

  // Private helpers

  private async headers(): Promise<Record<string, string>> {
    return {
      "X-Figma-Token": await this.getCredentials().then((r) => r.accessToken),
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${FIGMA_API_BASE}${path}`, {
      method: "GET",
      headers: await this.headers(),
    });
    if (!res.ok) {
      throw new Error(
        `Figma API error ${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${FIGMA_API_BASE}${path}`, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `Figma API error ${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`,
      );
    }
    return res.json() as Promise<T>;
  }

  // Files

  /**
   * Fetch a Figma file by its key.
   * @param fileKey - The Figma file key (e.g. "abc123XYZ")
   * @param depth  - Node tree depth (default 2; higher values return more detail)
   */
  async fetchFile(fileKey: string, depth = 2): Promise<FigmaFile> {
    return this.get<FigmaFile>(`/files/${fileKey}?depth=${depth}`);
  }

  /**
   * Fetch a specific node inside a Figma file.
   * Returns the full file with a `nodes` map containing only the requested node.
   */
  async fetchNode(
    fileKey: string,
    nodeId: string,
  ): Promise<{
    nodes: Record<string, { document: import("./types.ts").FigmaNode }>;
  }> {
    // Figma node IDs use colons but the API expects them URL-encoded as %3A
    return this.get(
      `/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    );
  }

  // Comments

  /**
   * Fetch all comments for a Figma file.
   */
  async fetchComments(fileKey: string): Promise<FigmaComment[]> {
    return this.get<{ comments: FigmaComment[] }>(
      `/files/${fileKey}/comments`,
    ).then((r) => r.comments);
  }

  /**
   * Post a new comment (or reply) on a Figma file.
   * @param fileKey   - The Figma file key
   * @param message   - Comment body text
   * @param replyToId - If set, creates a reply inside that thread
   */
  async postComment(
    fileKey: string,
    message: string,
    replyToId?: string,
  ): Promise<FigmaComment> {
    const body: Record<string, unknown> = { message };
    if (replyToId) {
      body.comment_id = replyToId;
    }
    return this.post<FigmaComment>(`/files/${fileKey}/comments`, body);
  }

  // Projects

  /**
   * Fetch all projects for a Figma team.
   * @param teamId - Figma team ID (found in your Figma URL: figma.com/files/team/<teamId>)
   */
  async fetchTeamProjects(teamId: string): Promise<FigmaProject[]> {
    return this.get<{ projects: FigmaProject[] }>(
      `/teams/${teamId}/projects`,
    ).then((r) => r.projects);
  }

  /**
   * Fetch all files in a Figma project.
   * @param projectId - Figma project ID
   */
  async fetchProjectFiles(projectId: string): Promise<FigmaProjectFile[]> {
    return this.get<{ files: FigmaProjectFile[] }>(
      `/projects/${projectId}/files`,
    ).then((r) => r.files);
  }

  // Version / metadata

  /**
   * Fetch the latest version string for a file (cheap sentinel for change detection).
   */
  async fetchFileVersion(fileKey: string): Promise<string> {
    // Use a depth=1 request to get just the top-level metadata cheaply
    return this.fetchFile(fileKey, 1).then((r) => r.version);
  }
}
