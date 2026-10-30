import { isDeepStrictEqual } from "node:util";

export const root = new URL("..", import.meta.url).pathname;

export function expect(label: string, actual: unknown, expected: unknown): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
