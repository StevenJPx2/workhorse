// `db.traces` — the queryable index over archived run traces.
//
// The trace BODY is an immutable R2 blob (no size ceiling); only the index is
// relational.

export { insert } from "./insert";
export { list } from "./list";
