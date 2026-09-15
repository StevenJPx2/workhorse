/** One escalation, with SQL nulls mapped to absent. */
export interface EscalationEntry {
  trigger: string;
  detail: string;
  stage?: string;
  toModel?: string;
  at: string;
}
