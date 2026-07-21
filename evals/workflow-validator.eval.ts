// Engine validator eval: the gate behind PUT /workflows must accept every
// legitimate spec shape and reject broken ones with actionable, path-
// prefixed messages. Deterministic (no LLM) — runs keyless in CI.

import { evalite } from "evalite";
import { validateWorkflowSpec } from "@workhorse/workflow";
import codingSpec from "../sandbox/workflows/coding/spec.json";
import screenshotSpec from "../sandbox/workflows/screenshot-pr/spec.json";

interface Case {
  name: string;
  spec: unknown;
  expectValid: boolean;
  /** For invalid specs: every one of these substrings must appear. */
  expectErrors?: string[];
}

const cases: Case[] = [
  { name: "seed: coding", spec: codingSpec, expectValid: true },
  { name: "seed: screenshot-pr", spec: screenshotSpec, expectValid: true },
  {
    name: "loop + until + report outcome",
    spec: {
      schemaVersion: 1,
      name: "research",
      artifactGraph: {
        stages: [
          { id: "refine", type: "loop", prompt: "x", until: "$.done", maxRounds: 4, outcome: "report" },
        ],
      },
    },
    expectValid: true,
  },
  {
    name: "declared inputs",
    spec: {
      schemaVersion: 1,
      name: "with-inputs",
      inputs: [
        { name: "target", type: "string", required: true },
        { name: "depth", type: "choice", options: ["shallow", "deep"] },
      ],
      artifactGraph: { stages: [{ id: "go", prompt: "x" }] },
    },
    expectValid: true,
  },
  {
    name: "unknown from-edge",
    spec: {
      schemaVersion: 1,
      name: "broken",
      artifactGraph: { stages: [{ id: "a", prompt: "x", from: "ghost" }] },
    },
    expectValid: false,
    expectErrors: ['unknown stage "ghost"'],
  },
  {
    name: "cycle",
    spec: {
      schemaVersion: 1,
      name: "cyclic",
      artifactGraph: {
        stages: [
          { id: "a", from: "b", prompt: "x" },
          { id: "b", from: "a", prompt: "y" },
        ],
      },
    },
    expectValid: false,
    expectErrors: ["cycle detected"],
  },
  {
    name: "bad tool classification",
    spec: {
      schemaVersion: 1,
      name: "badtool",
      artifactGraph: {
        stages: [{ id: "a", prompt: "x", tools: [{ name: "t", classification: "write" }] }],
      },
    },
    expectValid: false,
    expectErrors: ["classification"],
  },
  {
    name: "choice input without options",
    spec: {
      schemaVersion: 1,
      name: "badinput",
      inputs: [{ name: "pick", type: "choice" }],
      artifactGraph: { stages: [{ id: "a", prompt: "x" }] },
    },
    expectValid: false,
    expectErrors: ["options: required for choice"],
  },
];

evalite("workflow validator", {
  data: async () => cases.map((c) => ({ input: c, expected: c.expectValid ? "valid" : "invalid" })),
  task: async (c: Case) => {
    const errors = validateWorkflowSpec(c.spec);
    return JSON.stringify({ valid: errors.length === 0, errors });
  },
  scorers: [
    {
      name: "verdict",
      description: "Accepts valid specs, rejects invalid ones",
      scorer: ({ input, output }) => {
        const { valid } = JSON.parse(output) as { valid: boolean };
        return valid === input.expectValid ? 1 : 0;
      },
    },
    {
      name: "actionable-errors",
      description: "Rejections carry the expected path-prefixed messages",
      scorer: ({ input, output }) => {
        if (input.expectValid) return 1;
        const { errors } = JSON.parse(output) as { errors: string[] };
        const text = errors.join("\n");
        return (input.expectErrors ?? []).every((e) => text.includes(e)) ? 1 : 0;
      },
    },
  ],
});
