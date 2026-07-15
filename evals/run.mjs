#!/usr/bin/env node
// Evals runner: files the corpus once per variant, waits for terminal-ish
// states, then mines the trace archive into a comparison table.
//
//   node evals/run.mjs file      — file all corpus×variant tickets
//   node evals/run.mjs report    — collect metrics for filed tickets
//
// State lives in evals/.state.json (ticket ids per task×variant).
// Requires WORKHORSE_URL + WORKHORSE_TOKEN env vars (or .dev.vars fallback).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "corpus.json"), "utf8"));
const statePath = join(here, ".state.json");

const URL_ = process.env.WORKHORSE_URL ?? "https://workhorse-sandbox.stevenjpx2.workers.dev";
const TOKEN =
  process.env.WORKHORSE_TOKEN ??
  readFileSync(join(here, "..", ".dev.vars"), "utf8").match(/SPIKE_TOKEN=(.*)/)?.[1]?.trim();

const api = async (path, init = {}) => {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const cmd = process.argv[2];

if (cmd === "file") {
  const state = { filedAt: new Date().toISOString(), runs: [] };
  for (const variant of corpus.variants) {
    for (const task of corpus.tasks) {
      const { ticket } = await api("/tickets", {
        method: "POST",
        body: JSON.stringify({
          title: `${task.title} [${variant.id}]`,
          repo: corpus.repo,
          prompt: task.prompt,
          model: variant.model,
        }),
      });
      state.runs.push({ task: task.id, variant: variant.id, ticketId: ticket.id });
      console.log(`filed ${task.id} × ${variant.id} → ${ticket.id}`);
      // Stagger: serial sandbox load, avoid thundering herd on the token.
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`\n${state.runs.length} tickets filed. Wait ~10min, then: node evals/run.mjs report`);
} else if (cmd === "report") {
  if (!existsSync(statePath)) throw new Error("no .state.json — run `file` first");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const rows = [];
  for (const run of state.runs) {
    const { ticket } = await api(`/tickets/${run.ticketId}`);
    let metrics = { tokens: null, stages: null, failedStages: null, wallMs: null };
    try {
      const idx = await api(`/tickets/${run.ticketId}/traces`);
      if (idx.length) {
        const tr = await api(`/tickets/${run.ticketId}/traces/${idx[0].runId}`);
        const a = tr.activity ?? {};
        const tasks = a.tasks ?? [];
        metrics = {
          tokens: a.usage?.totalTokens ?? null,
          stages: tasks.length,
          failedStages: tasks.filter((t) => t.status === "failed").length,
          wallMs:
            a.startedAt && a.completedAt
              ? new Date(a.completedAt) - new Date(a.startedAt)
              : null,
        };
      }
    } catch {}
    rows.push({
      task: run.task,
      variant: run.variant,
      ticket: run.ticketId,
      status: ticket.status,
      pr: ticket.prUrl ? "yes" : "-",
      ...metrics,
    });
  }
  console.table(rows);
  // Per-variant rollup.
  const byVariant = {};
  for (const r of rows) {
    const v = (byVariant[r.variant] ??= { n: 0, delivered: 0, tokens: 0, wallMs: 0 });
    v.n++;
    if (r.pr === "yes") v.delivered++;
    v.tokens += r.tokens ?? 0;
    v.wallMs += r.wallMs ?? 0;
  }
  console.table(
    Object.entries(byVariant).map(([variant, v]) => ({
      variant,
      delivered: `${v.delivered}/${v.n}`,
      avgTokens: Math.round(v.tokens / v.n),
      avgWallMin: (v.wallMs / v.n / 60000).toFixed(1),
    })),
  );
} else {
  console.log("usage: node evals/run.mjs file|report");
}
