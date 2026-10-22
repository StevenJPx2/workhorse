import { Schema } from "effect";

const Name = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,62}$/));

/** An installed app's name; its methods are `<app>.<operation>`. */
export const AppName = Name;

export type AppName = typeof AppName.Type;

/** A root's name, which app code uses; the policy alone knows the real folder. */
export const RootName = Name;

export type RootName = typeof RootName.Type;

/** The local name of a paired daemon, chosen when pairing. */
export const PeerName = Name;

export type PeerName = typeof PeerName.Type;

/** A public operation as a method, `<app>.<operation>`, such as `notes.read`. */
export const MethodName = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]{0,62}\.[a-z][a-zA-Z0-9]{0,62}$/),
);

export type MethodName = typeof MethodName.Type;
