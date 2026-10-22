import { Schema } from "effect";

/** A link could not be opened: no identity, no route to the peer, or a dial that failed. */
export class LinkError extends Schema.TaggedError<
  LinkError,
  { readonly LinkError: unique symbol }
>()("LinkError", { message: Schema.String }) {}
