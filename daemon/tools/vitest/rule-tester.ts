import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

// RuleTester reports through these hooks; binding them turns every rule case into a Vitest test.
RuleTester.describe = describe;

RuleTester.it = it;
