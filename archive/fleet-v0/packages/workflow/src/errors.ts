/** A workflow agent failed for a non-transient reason. */
export class StageFailure extends Error {
  constructor(
    readonly stageId: string,
    readonly kind: "model" | "control" | "session" | "timeout" | "input",
    detail: string,
  ) {
    super(`stage ${stageId} failed (${kind}): ${detail}`);
    this.name = "StageFailure";
  }
}

/** All model legs are temporarily unavailable. The durable spine should sleep. */
export class ThrottledPark extends Error {
  constructor(
    readonly stageId: string,
    readonly retryAfterMs: number,
    readonly providers: string[],
  ) {
    super(`stage ${stageId} throttled; retry after ${retryAfterMs}ms`);
    this.name = "ThrottledPark";
  }
}
