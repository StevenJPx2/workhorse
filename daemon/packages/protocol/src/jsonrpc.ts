import { Schema } from "effect";

// JSON-RPC 2.0 envelopes. Method params are decoded by the method's own schema.

// A value that survives JSON.stringify and JSON.parse unchanged.
export type Json = Schema.Json;

const RequestId = Schema.Union([Schema.String, Schema.Int]);

export type RequestId = typeof RequestId.Type;

export const Request = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: RequestId,
  method: Schema.String,
  params: Schema.optionalKey(Schema.Json),
});

export type Request = typeof Request.Type;

export const ErrorObject = Schema.Struct({
  code: Schema.Int,
  message: Schema.String,
  data: Schema.optionalKey(Schema.Json),
});

export type ErrorObject = typeof ErrorObject.Type;

export const Success = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: RequestId,
  result: Schema.Json,
});

export type Success = typeof Success.Type;

// `id` is null only when the request was too malformed to read its id.
export const Failure = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.NullOr(RequestId),
  error: ErrorObject,
});

export type Failure = typeof Failure.Type;

export const Response = Schema.Union([Success, Failure]);

export type Response = typeof Response.Type;

export type Message = Request | Response;
