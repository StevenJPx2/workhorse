// fallow-ignore-file unused-export
// typebox/compile runtime shim for workerd.
//
// typebox's TypeCompiler generates a validator via `new Function` (codegen),
// which workerd forbids ("Code generation from strings disallowed for this
// context"). pi-ai's validateToolArguments calls Compile() for every tool
// call, so the compiled path must be replaced with typebox's runtime
// checker. Same semantics, no codegen.

import { Value } from "typebox/value";

export function Compile(schema) {
  return {
    Check: (value) => Value.Check(schema, value),
    Errors: (value) => Value.Errors(schema, value),
    Code: () => undefined,
    Encode: (value) => Value.Encode(schema, value),
    Decode: (value) => Value.Decode(schema, value),
  };
}

export const TypeCompiler = { Compile };
export default { Compile, TypeCompiler };
