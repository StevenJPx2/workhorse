// Minimal tolerant parser for .workhorse/scripts.toml seed files.
// Pure module (no cloudflare imports) so it stays unit-testable.

/**
 * Minimal tolerant parser for .workhorse/scripts.toml — [[script]] blocks
 * with string keys (name/description/command), triple-quoted or basic
 * strings, args = [{name, description, required}] inline tables, and
 * status_gates = ["..."]. Not a general TOML parser; committed seeds are
 * developer-authored and validation rejects anything malformed anyway.
 */
export function parseScriptsToml(toml: string): Array<{
  name: string;
  description?: string;
  command: string;
  args?: Array<{ name: string; description?: string; required?: boolean }>;
  statusGates?: string[];
}> {
  const out: Array<{
    name: string;
    description?: string;
    command: string;
    args?: Array<{ name: string; description?: string; required?: boolean }>;
    statusGates?: string[];
  }> = [];
  const blocks = toml.split(/^\s*\[\[script\]\]\s*$/m).slice(1);
  for (const block of blocks) {
    const str = (key: string): string | undefined => {
      // Triple-quoted (multiline) first, then basic.
      const tri = block.match(new RegExp(`^\\s*${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m"));
      if (tri) return tri[1].replace(/^\n/, "");
      const one = block.match(new RegExp(`^\\s*${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m"));
      return one ? one[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\") : undefined;
    };
    const name = str("name");
    const command = str("command");
    if (!name || !command) continue;
    const entry: (typeof out)[number] = { name, command, description: str("description") };
    const gates = block.match(/^\s*status_gates\s*=\s*\[([^\]]*)\]/m);
    if (gates) {
      entry.statusGates = [...gates[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    }
    const args = block.match(/^\s*args\s*=\s*\[([\s\S]*?)\]\s*$/m);
    if (args) {
      entry.args = [...args[1].matchAll(/\{([^}]*)\}/g)].map((m) => {
        const inner = m[1];
        const val = (k: string) => inner.match(new RegExp(`${k}\\s*=\\s*"([^"]*)"`))?.[1];
        return {
          name: val("name") ?? "",
          description: val("description"),
          required: /required\s*=\s*true/.test(inner),
        };
      }).filter((a) => a.name);
    }
    out.push(entry);
  }
  return out;
}