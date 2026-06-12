import z from "zod";

export const Status = z.enum([
  "planning",
  "implementing",
  "blocked",
  "ready_for_review",
  "in_review",
  "done",
]);

export type StatusT = z.infer<typeof Status>;
