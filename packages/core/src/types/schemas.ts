import { z } from "zod/v4";

export const IssueStatusSchema = z.enum([
  "pending",
  "queued",
  "planning",
  "implementing",
  "blocked",
  "pr_created",
  "in_review",
  "done",
]);

export const NotificationPrioritySchema = z.enum(["blocking", "high", "normal", "low"]);

export const NotificationStatusSchema = z.enum(["unread", "read", "acknowledged"]);
