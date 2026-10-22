import { describe, expect, it } from "vite-plus/test";
import { ErrorCode, readRequest } from "../src/index.ts";

const line = (text: string) => readRequest({ type: "line", text });

describe("readRequest", () => {
  it("decodes hello with its versions", () => {
    expect(line('{"jsonrpc":"2.0","id":1,"method":"hello","params":{"protocol":[1,2]}}')).toEqual({
      type: "hello",
      id: 1,
      params: { protocol: [1, 2] },
    });
  });

  it("passes another method's params through as JSON", () => {
    expect(line('{"jsonrpc":"2.0","id":"a","method":"notes.read","params":{"path":"x"}}')).toEqual({
      type: "call",
      id: "a",
      method: "notes.read",
      params: { path: "x" },
    });
  });

  it("rejects hello without a version list, keeping the id", () => {
    for (const params of ['{"protocol":[]}', '{"protocol":"1"}', "{}"]) {
      expect(line(`{"jsonrpc":"2.0","id":7,"method":"hello","params":${params}}`)).toMatchObject({
        type: "invalid",
        id: 7,
        code: ErrorCode.invalidParams,
      });
    }
  });

  it("reports text that is not JSON as a parse error with no id", () => {
    expect(line("{not json")).toMatchObject({
      type: "invalid",
      id: null,
      code: ErrorCode.parseError,
    });
    expect(readRequest({ type: "invalid_utf8" })).toMatchObject({
      id: null,
      code: ErrorCode.parseError,
    });
  });

  it("reports JSON that is not a request as invalid, echoing a readable id", () => {
    expect(line('{"jsonrpc":"1.0","id":3,"method":"hello"}')).toMatchObject({
      type: "invalid",
      id: 3,
      code: ErrorCode.invalidRequest,
    });
    expect(line("[1,2]")).toMatchObject({ id: null, code: ErrorCode.invalidRequest });
    expect(line('{"jsonrpc":"2.0","id":1.5,"method":"hello"}')).toMatchObject({ id: null });
  });
});
