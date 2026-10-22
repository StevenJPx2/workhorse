import { DateTime } from "effect";
import { element } from "./element.ts";
import { Tag } from "./tag.ts";

/** An X.509 time in UTC seconds: UTCTime through 2049, GeneralizedTime from 2050 (RFC 5280, 4.1.2.5). */
export function time(instant: DateTime.Utc): Uint8Array {
  const iso = DateTime.formatIso(instant);
  const digits = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  const utc = Number(iso.slice(0, 4)) < 2050;

  return element(
    utc ? Tag.utcTime : Tag.generalizedTime,
    new TextEncoder().encode(utc ? digits.slice(2) : digits),
  );
}
