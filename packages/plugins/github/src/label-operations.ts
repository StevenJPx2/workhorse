/** GitHub label operations. */
import { api } from "./gh-cli";

/** Add a label to an issue/PR */
export async function addLabel(
  owner: string,
  repo: string,
  number: number,
  label: string,
): Promise<void> {
  await api(`/repos/${owner}/${repo}/issues/${number}/labels`, {
    method: "POST",
    body: { labels: [label] },
  });
}

/** Remove a label from an issue/PR */
export async function removeLabel(
  owner: string,
  repo: string,
  number: number,
  label: string,
): Promise<void> {
  try {
    await api(
      `/repos/${owner}/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
      { method: "DELETE" },
    );
  } catch {
    // Label might not exist, ignore
  }
}
