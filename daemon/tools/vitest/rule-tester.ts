import { RuleTester } from "vite-plus/lint/plugins-dev";
import { describe, it } from "vite-plus/test";

// RuleTester reports through these hooks; binding them turns every rule case into a Vitest test.
RuleTester.describe = describe;

RuleTester.it = it;
