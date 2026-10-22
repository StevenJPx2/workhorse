/**
 * Which side of a pairing this machine takes: it waits on `listen` (and will accept the link),
 * or it dials `address` (and will dial the link).
 */
export type PairSide =
  | { readonly type: "accept"; readonly listen: string }
  | { readonly type: "dial"; readonly address: string };
