/** Pure rules for links between daemons: the mutual handshake and calls from paired peers. */
export { acceptLink } from "./accept-link.ts";

export { dialLink } from "./dial-link.ts";

export { linkStep, type LinkContext, type LinkEvent } from "./link-step.ts";

export type { LinkEffect, LinkStep, Transcript } from "./link-effect.ts";

export type { LinkPeer, LinkState, Peers } from "./link-state.ts";
