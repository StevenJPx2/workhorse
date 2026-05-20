/**
 * Re-export workhorse-core for local plugin authors.
 * Usage: import { definePlugin, useWorkhorse } from "@fdcn/workhorse/core";
 * @module @fdcn/workhorse/core
 */

// oxlint-disable-next-line workhorse/no-reexport-outside-barrel -- intentional subpath export
export * from "workhorse-core";
