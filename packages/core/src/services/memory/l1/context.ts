import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IssueStatus } from "#db";
import type { SessionEntry, SessionMemory } from "../types.ts";
import { parseSessionMemory } from "./parse.ts";
import { serializeSessionMemory } from "./serialize.ts";

/** Path to context.md within a worktree */
export const CONTEXT_FILE = ".jiratown/context.md";

/**
 * Handle for CRUD operations on a specific worktree's context.md.
 * Obtained via `L1Store.get(issueId)`.
 */
export class L1Context {
  private readonly contextPath: string;

  constructor(readonly worktreePath: string) {
    this.contextPath = join(worktreePath, CONTEXT_FILE);
  }

  /** Check if the context.md file exists */
  exists(): boolean {
    return existsSync(this.contextPath);
  }

  /** Read and parse the context.md file */
  async read(): Promise<SessionMemory | null> {
    if (!this.exists()) return null;
    return parseSessionMemory(await readFile(this.contextPath, "utf-8"));
  }

  /** Write a SessionMemory to the context.md file */
  async write(memory: SessionMemory): Promise<void> {
    const dir = dirname(this.contextPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.contextPath, serializeSessionMemory(memory), "utf-8");
  }

  /** Create a new context.md file with initial session */
  async create(title: string, status: IssueStatus): Promise<SessionMemory> {
    const memory: SessionMemory = {
      title,
      patterns: [],
      sessions: [
        {
          timestamp: new Date(),
          status,
          summary: ["Session initialized"],
          learnings: [],
          filesChanged: [],
        },
      ],
      latestStatus: status,
    };

    await this.write(memory);
    return memory;
  }

  /** Append a new session entry to the context.md file */
  async appendSession(entry: SessionEntry): Promise<void> {
    const memory = await this.read();
    if (!memory) {
      throw new Error(`No session memory found at ${this.worktreePath}`);
    }

    memory.sessions.push(entry);
    memory.latestStatus = entry.status;
    await this.write(memory);
  }

  /** Update the patterns section of the context.md file */
  async updatePatterns(patterns: string[]): Promise<void> {
    const memory = await this.read();
    if (!memory) {
      throw new Error(`No session memory found at ${this.worktreePath}`);
    }

    memory.patterns = patterns;
    await this.write(memory);
  }
}
