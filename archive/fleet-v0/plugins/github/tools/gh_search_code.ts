// gh_search_code — search code across GitHub (repo:/org:/language:/path:/filename:).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { gh } from "../api";
import { asEnv, j } from "./_shared";

export default tool({
  name: "gh_search_code",
  description:
    "Search code across GitHub (qualifiers: repo:, org:, language:, path:, filename:). Use for " +
    "'how do others call this API' or finding definitions in dependencies.",
  docs: `
gh_search_code — code search across GitHub.

ARGUMENTS
  query  (required) supports qualifiers: repo: org: language: path: filename:

EXAMPLES

  { query: "createFlueContext language:typescript" }
  { query: "defineIndex repo:acme/widgets" }
  { query: "VectorizeIndex language:typescript path:src" }

WHEN TO USE
  "How do others call this API", or finding a definition inside a dependency you
  don't have locally. For code in the CURRENT workspace use aft_search — it is
  structural and much more precise.
`,
  input: v.object({ query: v.string() }),
  async run({ input, ...ctx }) {
    const data = (await gh(asEnv(ctx), `/search/code?q=${encodeURIComponent(input.query)}&per_page=10`)) as {
      total_count?: number;
      items?: Array<{ repository?: { full_name?: string }; path?: string; html_url?: string }>;
    };
    return j({ total: data.total_count, items: (data.items ?? []).map((i) => ({ repo: i.repository?.full_name, path: i.path, url: i.html_url })) });
  },
});
