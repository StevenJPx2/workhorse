import { Schema } from "effect";

// The client lists every version it speaks; the daemon picks one or refuses.
export const HelloParams = Schema.Struct({
  protocol: Schema.NonEmptyArray(Schema.Int),
});

export type HelloParams = typeof HelloParams.Type;

export const HelloResult = Schema.Struct({
  protocol: Schema.Int,
});

export type HelloResult = typeof HelloResult.Type;
