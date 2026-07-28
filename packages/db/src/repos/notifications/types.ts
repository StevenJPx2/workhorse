export interface NotificationDraft {
  ticketId: string;
  source: string;
  kind?: string;
  body: string;
  author?: string;
  urgent?: boolean;
}

/** Bodies are capped so one pasted log cannot dominate a stage's prompt. */
export const MAX_BODY = 8000;
