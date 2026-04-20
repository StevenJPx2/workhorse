export type IssueStatus =
  | "pending"
  | "queued"
  | "planning"
  | "implementing"
  | "blocked"
  | "pr_created"
  | "in_review"
  | "done";

export interface Issue {
  id: string;
  externalId: string;
  source: string;
  title: string;
  description: string;
  status: IssueStatus;
  issueType: string;
  url?: string;
  assignee?: string;
  labels?: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
