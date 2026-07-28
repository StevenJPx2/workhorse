import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import gh_ci from "../gh_ci";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const ci = (input: Record<string, unknown> = {}) =>
  runTool(gh_ci, input, { ticket: { repo: "acme/widgets" }, env: { GITHUB_TOKEN: "t" } });

const RUNS = {
  workflow_runs: [
    {
      id: 111,
      name: "CI",
      head_branch: "fix/login",
      status: "completed",
      conclusion: "failure",
      html_url: "https://github.com/acme/widgets/actions/runs/111",
      // Noise the tool drops.
      head_commit: { message: "wip" },
      repository: { full_name: "acme/widgets" },
    },
  ],
};

const JOBS = {
  jobs: [
    {
      name: "test",
      status: "completed",
      conclusion: "failure",
      steps: [
        { name: "Checkout", conclusion: "success" },
        { name: "Install", conclusion: "success" },
        { name: "Run tests", conclusion: "failure" },
        { name: "Upload coverage", conclusion: "skipped" },
      ],
    },
  ],
};

describe("gh_ci — help", () => {
  it("returns documentation without calling GitHub", async () => {
    const { output } = await ci({ help: true });

    expect(output).toContain("gh_ci");
    expect(output).toContain("THE USUAL LOOP");
  });
});

describe("gh_ci — run list", () => {
  it("projects id, name, branch, conclusion, and url", async () => {
    stub = stubFetch({ "/actions/runs": JSON.stringify(RUNS) });
    const { output } = await ci();

    expect(output).toContain('"id": 111');
    expect(output).toContain('"branch": "fix/login"');
    expect(output).toContain('"conclusion": "failure"');
    expect(output).toContain("actions/runs/111");
    // The id is what the agent feeds back as runId — it must survive.
    expect(output).not.toContain("head_commit");
    expect(output).not.toContain("repository");
  });

  it("filters by branch when given", async () => {
    stub = stubFetch({ "/actions/runs": JSON.stringify(RUNS) });
    await ci({ branch: "fix/login" });

    expect(stub.urls()[0]).toContain("branch=fix%2Flogin");
  });

  it("caps the list at 10 runs", async () => {
    stub = stubFetch({ "/actions/runs": JSON.stringify(RUNS) });
    await ci();

    expect(stub.urls()[0]).toContain("per_page=10");
  });

  it("falls back to status when a run has no conclusion yet", async () => {
    stub = stubFetch({
      "/actions/runs": JSON.stringify({
        workflow_runs: [{ id: 1, name: "CI", head_branch: "main", status: "in_progress", conclusion: null }],
      }),
    });
    const { output } = await ci();

    // A running job has conclusion:null; reporting null tells the agent nothing.
    expect(output).toContain('"conclusion": "in_progress"');
  });

  it("handles a response with no runs", async () => {
    stub = stubFetch({ "/actions/runs": "{}" });
    const { output } = await ci();

    expect(output).toBe("[]");
  });
});

describe("gh_ci — one run's jobs", () => {
  it("requests the jobs subresource for a runId", async () => {
    stub = stubFetch({ "/actions/runs/111/jobs": JSON.stringify(JOBS) });
    await ci({ runId: 111 });

    expect(stub.urls()[0]).toContain("/actions/runs/111/jobs");
  });

  it("extracts ONLY the failed step names — that is the actionable part", async () => {
    stub = stubFetch({ "/actions/runs/111/jobs": JSON.stringify(JOBS) });
    const { output } = await ci({ runId: 111 });

    expect(output).toContain("Run tests");
    // Successes and skips are noise when you're diagnosing a red build.
    expect(output).not.toContain("Checkout");
    expect(output).not.toContain("Upload coverage");
  });

  it("returns an empty failedSteps array for a passing job", async () => {
    stub = stubFetch({
      "/actions/runs/111/jobs": JSON.stringify({
        jobs: [{ name: "test", status: "completed", conclusion: "success", steps: [{ name: "Run", conclusion: "success" }] }],
      }),
    });
    const { output } = await ci({ runId: 111 });

    expect(output).toContain('"failedSteps": []');
  });

  it("handles a job with no steps array", async () => {
    stub = stubFetch({
      "/actions/runs/111/jobs": JSON.stringify({ jobs: [{ name: "test", status: "queued", conclusion: null }] }),
    });
    const { output } = await ci({ runId: 111 });

    expect(output).toContain('"conclusion": "queued"');
    expect(output).toContain('"failedSteps": []');
  });

  it("prefers runId over branch when both are given", async () => {
    stub = stubFetch({ "/actions/runs/111/jobs": JSON.stringify(JOBS) });
    await ci({ runId: 111, branch: "main" });

    expect(stub.urls()[0]).toContain("/jobs");
    expect(stub.urls()[0]).not.toContain("branch=");
  });
});

describe("gh_ci — errors", () => {
  it("propagates a GitHub error", async () => {
    stub = stubFetch({ "/actions/runs": { status: 403, body: '{"message":"Forbidden"}' } });

    await expect(ci()).rejects.toThrow(/github 403/);
  });
});
