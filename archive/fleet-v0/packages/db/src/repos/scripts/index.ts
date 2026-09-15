// `db.scripts` — agent self-extension.
//
// A script is a named, replayable Code Mode program: the stabilized rung above
// run_code. run_code discovers a working tool chain, write_script saves it,
// run_script replays it with no fresh reasoning.

export { all } from "./all";
export { get } from "./get";
export { list } from "./list";
// Exported as `remove` (db.scripts.remove) — `delete` is a reserved word, so a
// function named `delete` cannot be declared.
export { remove } from "./remove";
export { upsert } from "./upsert";
