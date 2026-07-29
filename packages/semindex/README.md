# @workhorse/semindex

A toolkit for building a semantic index over Vectorize and Workers AI.

This is plugin tooling. A plugin that owns a registry can make it searchable
without writing embedding code.

## API

```ts
const index = defineIndex({
  name: "scripts",
  binding: (env) => env.VECTORIZE,
  load: (env) => listScripts(env),
  text: (s) => `${s.name} ${s.description}`,
});

await index.rebuild(env);
const hits = await index.query(env, "run the migrations");
```

## Notes

This package is generic on purpose. It knows nothing about scripts, workflows, or
tools. `packages/server/src/semindex.ts` defines the fleet's own corpora with it.

It is not the same thing as agent memory. Memory holds durable facts about one
repo and lives in AI Search. An index here makes an existing registry searchable.
The two have different lifetimes and different owners.

The live consumer is `workhorse_find_workflow`, which ranks workflows for a task
before a ticket is filed.
