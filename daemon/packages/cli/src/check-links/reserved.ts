/** Base capabilities and link methods: an app or a route by these names would shadow them. */
export const RESERVED: ReadonlySet<string> = new Set(["fs", "net", "link"]);
