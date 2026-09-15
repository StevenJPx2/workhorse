#!/usr/bin/env bash
# Phase 1 gate: build the TS tool → WASM component, load it in the Rust host,
# and assert the guest reaches the filesystem ONLY through the granted, scoped
# capability. Fails loudly if the broker ever leaks.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> building component from TypeScript"
(cd tool && npm install --no-audit --no-fund --silent && node build.mjs)

echo "==> building host"
(cd host && cargo build --quiet)

echo "==> preparing fixture"
mkdir -p fixture/project
printf 'hello from inside the granted root\n' > fixture/project/hello.txt
printf 'TOP SECRET — outside the granted root\n' > fixture/secret.txt

echo "==> asserting guest imports only the host capability"
imports=$(wasm-tools component wit build/tool.component.wasm)
grep -q 'import wrkhse:spike/host-fs' <<<"$imports"
if grep -q 'import wasi:' <<<"$imports"; then
  echo "FAIL: component imports WASI — sandbox is not pure" >&2
  exit 1
fi

echo "==> running end-to-end"
out=$(./host/target/debug/host fixture/project build/tool.component.wasm hello.txt ../secret.txt)
echo "$out"

grep -q 'guest read 35 bytes via host capability' <<<"$out" \
  || { echo "FAIL: granted read did not succeed" >&2; exit 1; }
grep -q 'denied by host: .*escapes the granted root' <<<"$out" \
  || { echo "FAIL: path escape was NOT denied by the host" >&2; exit 1; }

echo "PASS: capability brokered, escape denied, no ambient access"
