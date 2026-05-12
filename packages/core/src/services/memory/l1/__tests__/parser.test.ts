import { describe, expect, it } from "vitest";
import type { SessionMemory } from "#services/memory/types";
import { parseSessionMemory, serializeSessionMemory } from "../index.ts";

describe("parseSessionMemory", () => {
  it("parses empty content", () => {
    const memory = parseSessionMemory("");
    expect(memory.title).toBe("");
    expect(memory.patterns).toEqual([]);
    expect(memory.sessions).toEqual([]);
    expect(memory.latestStatus).toBe("pending");
  });

  it("parses title", () => {
    const content = "# AM-123: Fix authentication bug\n\n## Patterns\n\n## Sessions\n";
    const memory = parseSessionMemory(content);
    expect(memory.title).toBe("AM-123: Fix authentication bug");
  });

  it("parses patterns", () => {
    const content = `# AM-123: Test

## Patterns
- Use drizzle for DB access
- Always run typecheck before commit
- Follow TDD approach

## Sessions
`;
    const memory = parseSessionMemory(content);
    expect(memory.patterns).toEqual([
      "Use drizzle for DB access",
      "Always run typecheck before commit",
      "Follow TDD approach",
    ]);
  });

  it("parses session entry with all fields", () => {
    const content = `# AM-123: Test

## Patterns

## Sessions

### 2025-07-15T10:30:00Z — Initial implementation
Status: implementing
- Analyzed requirements
- Created migration
- **Learnings:**
  - Migrations need db:generate first
  - Schema changes require restart
- **Files changed:** src/db/schema.ts, migrations/0001.sql
---
`;
    const memory = parseSessionMemory(content);
    expect(memory.sessions).toHaveLength(1);

    const session = memory.sessions[0]!;
    expect(session.timestamp).toEqual(new Date("2025-07-15T10:30:00Z"));
    expect(session.status).toBe("implementing");
    expect(session.summary).toEqual(["Analyzed requirements", "Created migration"]);
    expect(session.learnings).toEqual([
      "Migrations need db:generate first",
      "Schema changes require restart",
    ]);
    expect(session.filesChanged).toEqual(["src/db/schema.ts", "migrations/0001.sql"]);
  });

  it("parses multiple sessions", () => {
    const content = `# AM-123: Test

## Patterns

## Sessions

### 2025-07-15T10:00:00Z — Session 1
Status: planning
- Did planning
---

### 2025-07-15T12:00:00Z — Session 2
Status: implementing
- Started implementation
---
`;
    const memory = parseSessionMemory(content);
    expect(memory.sessions).toHaveLength(2);
    expect(memory.sessions[0]!.status).toBe("planning");
    expect(memory.sessions[1]!.status).toBe("implementing");
    expect(memory.latestStatus).toBe("implementing");
  });

  it("handles session without learnings or files", () => {
    const content = `# AM-123: Test

## Patterns

## Sessions

### 2025-07-15T10:00:00Z — Simple session
Status: done
- Just did something
---
`;
    const memory = parseSessionMemory(content);
    expect(memory.sessions[0]!.learnings).toEqual([]);
    expect(memory.sessions[0]!.filesChanged).toEqual([]);
  });

  it("skips unrecognized lines in session content", () => {
    // Lines that don't match any pattern should be skipped
    const content = `# AM-123: Test

## Patterns

## Sessions

### 2025-07-15T10:00:00Z — Session with weird lines
Status: done
This is a random line that doesn't start with -
Another line without bullet
- Valid summary item
> A blockquote that should be skipped
---
`;
    const memory = parseSessionMemory(content);
    // Only the valid bullet point should be parsed
    expect(memory.sessions[0]!.summary).toEqual(["Valid summary item"]);
    expect(memory.sessions[0]!.learnings).toEqual([]);
    expect(memory.sessions[0]!.filesChanged).toEqual([]);
  });

  it("defaults to pending status when Status line is missing", () => {
    // Tests the ?? "pending" fallback in parseSessionStatus
    const content = `# AM-123: Test

## Patterns

## Sessions

### 2025-07-15T10:00:00Z — No status line
- Did something
---
`;
    const memory = parseSessionMemory(content);
    expect(memory.sessions[0]!.status).toBe("pending");
  });

  it("handles invalid session header format", () => {
    // Tests the null return from parseSessionHeader
    const content = `# AM-123: Test

## Patterns

## Sessions

### Invalid header without timestamp
Status: done
- Did something
---
`;
    const memory = parseSessionMemory(content);
    // Should skip sessions with invalid headers
    expect(memory.sessions).toHaveLength(0);
  });
});

describe("serializeSessionMemory", () => {
  it("serializes empty memory", () => {
    const memory: SessionMemory = {
      title: "AM-123: Test",
      patterns: [],
      sessions: [],
      latestStatus: "pending",
    };
    const content = serializeSessionMemory(memory);
    expect(content).toContain("# AM-123: Test");
    expect(content).toContain("## Patterns");
    expect(content).toContain("## Sessions");
  });

  it("serializes patterns", () => {
    const memory: SessionMemory = {
      title: "Test",
      patterns: ["Pattern 1", "Pattern 2"],
      sessions: [],
      latestStatus: "pending",
    };
    const content = serializeSessionMemory(memory);
    expect(content).toContain("- Pattern 1");
    expect(content).toContain("- Pattern 2");
  });

  it("serializes session with all fields", () => {
    const memory: SessionMemory = {
      title: "Test",
      patterns: [],
      sessions: [
        {
          timestamp: new Date("2025-07-15T10:30:00Z"),
          status: "implementing",
          summary: ["Did thing 1", "Did thing 2"],
          learnings: ["Learning 1"],
          filesChanged: ["file1.ts", "file2.ts"],
        },
      ],
      latestStatus: "implementing",
    };
    const content = serializeSessionMemory(memory);
    expect(content).toContain("### 2025-07-15T10:30:00Z — Did thing 1");
    expect(content).toContain("Status: implementing");
    expect(content).toContain("- Did thing 2");
    expect(content).toContain("- **Learnings:**");
    expect(content).toContain("  - Learning 1");
    expect(content).toContain("- **Files changed:** file1.ts, file2.ts");
  });

  it("round-trips through parse/serialize", () => {
    const original: SessionMemory = {
      title: "AM-123: Full Test",
      patterns: ["Pattern A", "Pattern B"],
      sessions: [
        {
          timestamp: new Date("2025-07-15T10:00:00Z"),
          status: "planning",
          summary: ["Planned things"],
          learnings: ["Learning X"],
          filesChanged: ["a.ts"],
        },
        {
          timestamp: new Date("2025-07-15T12:00:00Z"),
          status: "implementing",
          summary: ["Implemented things"],
          learnings: [],
          filesChanged: [],
        },
      ],
      latestStatus: "implementing",
    };

    const serialized = serializeSessionMemory(original);
    const parsed = parseSessionMemory(serialized);

    expect(parsed.title).toBe(original.title);
    expect(parsed.patterns).toEqual(original.patterns);
    expect(parsed.sessions).toHaveLength(2);
    expect(parsed.latestStatus).toBe(original.latestStatus);
  });
});
