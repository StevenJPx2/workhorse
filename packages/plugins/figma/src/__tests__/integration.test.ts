/**
 * Integration tests for the Figma plugin — no mocking, hits the real Figma API.
 *
 * Required env var:
 *   FIGMA_ACCESS_TOKEN  - Personal Access Token (read:files, read:comments, write:comments)
 *
 * Optional env vars (used to test file/comment operations):
 *   FIGMA_TEST_FILE_KEY  - Figma file key to use for tests (defaults to a public community file)
 *
 * Run with:
 *   cd packages/plugins/figma && FIGMA_ACCESS_TOKEN=xxx bun run vitest run src/__tests__/integration.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";
import { FigmaClient } from "../client.ts";
import { canParseFigma, extractFigmaRef } from "../parser.ts";

const ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN ?? "";
// A small, public Figma community file — "Figma Community Starter" by Figma
// Using a community file avoids needing a team/project token for read access.
const FILE_KEY = process.env.FIGMA_TEST_FILE_KEY ?? "fXivSykfZijyfbWK0ynpz2";

const SKIP = !ACCESS_TOKEN;

let client: FigmaClient;

beforeAll(() => {
  if (SKIP) return;
  client = new FigmaClient(async () => ({ accessToken: ACCESS_TOKEN }));
});

// FigmaClient.fetchFile

describe.skipIf(SKIP)("FigmaClient.fetchFile", () => {
  it("fetches a real Figma file and returns its name", async () => {
    const file = await client.fetchFile(FILE_KEY, 1);
    expect(typeof file.name).toBe("string");
    expect(file.name.length).toBeGreaterThan(0);
    expect(typeof file.version).toBe("string");
    expect(typeof file.lastModified).toBe("string");
    console.log(`  → file name: "${file.name}" (version ${file.version})`);
  });

  it("throws a descriptive error for a non-existent file", async () => {
    await expect(client.fetchFile("00000000000000NOTREAL")).rejects.toThrow(/Figma API error/);
  });
});

// FigmaClient.fetchFileVersion

describe.skipIf(SKIP)("FigmaClient.fetchFileVersion", () => {
  it("returns the version string", async () => {
    const version = await client.fetchFileVersion(FILE_KEY);
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
    console.log(`  → version: ${version}`);
  });
});

// FigmaClient.fetchComments

describe.skipIf(SKIP)("FigmaClient.fetchComments", () => {
  it("returns an array of comments (may be empty)", async () => {
    const comments = await client.fetchComments(FILE_KEY);
    expect(Array.isArray(comments)).toBe(true);
    console.log(`  → ${comments.length} comment(s) on file`);
    for (const c of comments.slice(0, 3)) {
      expect(c).toMatchObject({
        id: expect.any(String),
        message: expect.any(String),
        user: { handle: expect.any(String) },
      });
    }
  });
});

// canParseFigma (utility function)

describe.skipIf(SKIP)("canParseFigma", () => {
  it("recognises the test file URL", () => {
    expect(canParseFigma(`https://www.figma.com/file/${FILE_KEY}/Test`)).toBe(true);
  });

  it("rejects a plain string", () => {
    expect(canParseFigma("fix the header layout")).toBe(false);
  });
});

// extractFigmaRef (utility function)

describe.skipIf(SKIP)("extractFigmaRef", () => {
  it("extracts the correct fileKey from the test URL", () => {
    const ref = extractFigmaRef(`https://www.figma.com/file/${FILE_KEY}/Test-File`);
    expect(ref).not.toBeNull();
    expect(ref!.fileKey).toBe(FILE_KEY);
  });
});
