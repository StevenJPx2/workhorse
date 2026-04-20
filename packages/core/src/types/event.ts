export interface IssueEvent {
  id: string;
  issueId: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
