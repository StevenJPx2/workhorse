import { createConsoleReporter, defineDiagnostics } from "nostics";

/**
 * Single source of truth for Workhorse errors and diagnostics.
 *
 * Producers call a code the moment they detect a problem
 * (`diagnostics.WH_SKILL_NO_DESCRIPTION({ path }, { method: "error" })`); the
 * reporters deliver it. Severity is the console method: `error` for failures,
 * the default `warn` for advisories. Nothing is threaded back through return
 * types or hooks.
 */
export const diagnostics = defineDiagnostics({
  codes: {
    WH_SCRIPT_INVALID: {
      fix: "Fix the script's front-matter (# ---) block so its args validate.",
      why: (p: { detail: string; path: string }) =>
        `Invalid script at ${p.path}: ${p.detail}`,
    },
    WH_SCRIPT_MISSING_ARG: {
      fix: "Pass the argument or give it a default in the script's args.",
      why: (p: { kind: string; name: string; script: string }) =>
        `Missing required ${p.kind} "${p.name}" for script "${p.script}".`,
    },
    WH_SCRIPT_UNKNOWN_OPTION: {
      fix: "Remove the option or declare it in the script's args.",
      why: (p: { name: string; script: string }) =>
        `Unknown option "${p.name}" for script "${p.script}".`,
    },
    WH_SKILL_FRONTMATTER: {
      fix: "Fix the YAML between the skill's front-matter fences.",
      why: (p: { path: string }) =>
        `Unparseable front matter in ${p.path}; skill skipped.`,
    },
    WH_SKILL_NAME_MISMATCH: {
      fix: "Rename the skill or its directory so they match.",
      why: (p: { expected: string; name: string }) =>
        `Skill name "${p.name}" does not match its directory "${p.expected}".`,
    },
    WH_SKILL_NAME_TOO_LONG: {
      fix: "Use a shorter skill name.",
      why: (p: { max: number; name: string }) =>
        `Skill name "${p.name}" exceeds ${p.max} characters.`,
    },
    WH_SKILL_NO_DESCRIPTION: {
      fix: "Add a `description` field to the skill front matter.",
      why: (p: { path: string }) =>
        `Skill at ${p.path} is missing a description; skipped.`,
    },
    WH_SKILL_SHADOWED: {
      fix: "Rename one of the skills to avoid the collision.",
      why: (p: { name: string }) =>
        `A later skill named "${p.name}" shadows an earlier one.`,
    },
  },
  reporters: [createConsoleReporter()],
});
