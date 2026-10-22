/** A `host:port` address split for a socket; a bracketed IPv6 host loses its brackets. */
export type HostPort = { readonly host: string; readonly port: number };

/** Split an address the `PeerAddress` schema has already checked. */
export function hostPort(address: string): HostPort {
  const colon = address.lastIndexOf(":");
  const host = address.slice(0, colon);

  return {
    host: host.startsWith("[") ? host.slice(1, -1) : host,
    port: Number(address.slice(colon + 1)),
  };
}
