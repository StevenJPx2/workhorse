import { expect, test } from "bun:test";
import { type Effect, Mailbox } from "./mailbox.ts";

const publish = (mailbox: Mailbox, key: string): Effect[] =>
  mailbox.handle({ type: "publish", key, event: "{}" });

test("duplicate key is rejected even after ack", () => {
  const mailbox = new Mailbox();
  expect(publish(mailbox, "a")).toContainEqual({ type: "reply", result: { status: "published", seq: 1 } });
  mailbox.handle({ type: "ack", seq: 1 });
  expect(publish(mailbox, "a")).toEqual([{ type: "reply", result: { status: "duplicate" } }]);
});

test("restore keeps keys and redelivers only unacked", () => {
  const mailbox = new Mailbox();
  mailbox.handle({
    type: "restore",
    events: [
      { seq: 1, key: "a", event: "{}", acked: true },
      { seq: 2, key: "b", event: "{}", acked: false },
    ],
    every_ms: null,
  });
  const delivered = mailbox
    .handle({ type: "connect" })
    .flatMap((effect) => (effect.type === "deliver" ? [effect.seq] : []));
  expect(delivered).toEqual([2]);
  expect(publish(mailbox, "a")).toEqual([{ type: "reply", result: { status: "duplicate" } }]);
  expect(publish(mailbox, "c")).toContainEqual({ type: "reply", result: { status: "published", seq: 3 } });
});
