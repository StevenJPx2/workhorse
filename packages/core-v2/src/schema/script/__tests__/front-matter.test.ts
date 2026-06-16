import { describe, expect, it } from "vitest";

import { parseFrontMatter, serializeFrontMatter } from "../front-matter";

function fixture(
  name: "late-fence" | "no-fence" | "unterminated" | "valid",
): string {
  switch (name) {
    case "valid": {
      return [
        "#!/usr/bin/env bash",
        "# ---",
        "# description: Greets a user",
        "# args:",
        "#   positional:",
        "#     - name: name",
        "#       description: Who to greet",
        "#       required: true",
        "# ---",
        'echo "Hello, $1!"',
        "",
      ].join("\n");
    }
    case "no-fence": {
      return ["echo hi", "# too late", ""].join("\n");
    }
    case "late-fence": {
      return ["echo hi", "# ---", "# description: nope", "# ---", ""].join(
        "\n",
      );
    }
    case "unterminated": {
      return ["# ---", "# description: dangling", "echo hi", ""].join("\n");
    }
  }
}

describe("parseFrontMatter", () => {
  it("reads description and args from a comment-fenced block", () => {
    const raw = fixture("valid");
    const { args, command, description } = parseFrontMatter(raw);

    expect(description).toBe("Greets a user");
    expect(args?.positional[0]).toEqual({
      description: "Who to greet",
      name: "name",
      required: true,
    });
    // The whole file (header included) is preserved as the command.
    expect(command).toBe(raw);
  });

  it("returns no description when there is no front matter", () => {
    const { command, description } = parseFrontMatter(fixture("no-fence"));

    expect(description).toBeUndefined();
    expect(command).toBe(fixture("no-fence"));
  });

  it("returns no description when a fence is not at the top of the file", () => {
    const { command, description } = parseFrontMatter(fixture("late-fence"));

    expect(description).toBeUndefined();
    expect(command).toBe(fixture("late-fence"));
  });

  it("returns no description when an unterminated block", () => {
    const { command, description } = parseFrontMatter(fixture("unterminated"));

    expect(description).toBeUndefined();
    expect(command).toBe(fixture("unterminated"));
  });
});

describe("serializeFrontMatter", () => {
  it("round-trips description and args back through parseFrontMatter", () => {
    const args = {
      options: [{ description: "Verbose", name: "verbose" }],
      positional: [{ description: "Target", name: "target", required: true }],
    };

    const file = serializeFrontMatter({
      args,
      command: "echo $1\n",
      description: "Go",
    });

    // The serialized file stays a comment-only header (valid shell).
    expect(file.startsWith("# ---\n")).toBe(true);

    const parsed = parseFrontMatter(file);
    expect(parsed.description).toBe("Go");
    expect(parsed.args?.positional[0]?.name).toBe("target");
    expect(parsed.args?.positional[0]?.required).toBe(true);
    expect(parsed.args?.options[0]?.name).toBe("verbose");
  });
});
