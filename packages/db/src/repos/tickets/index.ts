// `db.tickets` — the fleet's units of work.
//
// One file per operation. The barrel is what `bind()` consumes, so adding an
// operation is a new file plus one line here.

export { get } from "./get";
export { knownRepos } from "./known-repos";
export { list } from "./list";
export { patch } from "./patch";
export { put } from "./put";
