import { isIP } from "node:net";

/**
 * Validation for URLs Qentrax will make an outbound request to.
 *
 * Advertisers supply their own delivery endpoints, so an unvalidated URL turns
 * the delivery worker into a confused deputy: a request to
 * http://169.254.169.254/ reaches the cloud metadata service from inside the
 * trust boundary, and http://127.0.0.1/ reaches services never meant to face
 * the internet. Every outbound destination goes through here first.
 *
 * Loopback is permitted only when QENTRAX_ALLOW_LOOPBACK_DELIVERY=1, which the
 * local end-to-end harness sets. It is never honoured in production.
 */
export const ALLOWED_PROTOCOLS = ["https:", "http:"] as const;

export type UrlRejection =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "CREDENTIALS_IN_URL"
  | "PRIVATE_ADDRESS"
  | "LOOPBACK_ADDRESS"
  | "LINK_LOCAL_ADDRESS"
  | "METADATA_ADDRESS"
  | "BLOCKED_HOSTNAME";

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlRejection; detail: string };

/** Cloud instance metadata, reachable from inside most hosting networks. */
const METADATA_HOSTS = new Set(["169.254.169.254", "metadata.google.internal", "metadata"]);

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost"]);

/**
 * URL.hostname renders an IPv6 literal wrapped in brackets ("[::1]"), which
 * node:net's isIP does not accept. Normalize before any address test.
 */
function bareHost(host: string): string {
  return host.replace(/^\[|\]$/g, "").toLowerCase();
}

function ipv4Parts(host: string): number[] | null {
  const h = bareHost(host);
  if (isIP(h) !== 4) return null;
  return h.split(".").map(Number);
}

export function isLoopbackAddress(host: string): boolean {
  const v4 = ipv4Parts(host);
  if (v4) return v4[0] === 127;
  const h = bareHost(host);
  if (isIP(h) === 6) return h === "::1" || h === "0:0:0:0:0:0:0:1";
  return false;
}

export function isLinkLocalAddress(host: string): boolean {
  const v4 = ipv4Parts(host);
  if (v4) return v4[0] === 169 && v4[1] === 254;
  const h = bareHost(host);
  if (isIP(h) === 6) return h.startsWith("fe80:");
  return false;
}

export function isPrivateAddress(host: string): boolean {
  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 10) return true;                    // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;      // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 0) return true;                     // 0.0.0.0/8
    return false;
  }
  const h = bareHost(host);
  if (isIP(h) === 6) {
    // Unique local addresses fc00::/7.
    return h.startsWith("fc") || h.startsWith("fd") || h === "::";
  }
  return false;
}

export function loopbackAllowed(): boolean {
  return (
    process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY === "1" &&
    process.env.NODE_ENV !== "production" &&
    process.env.QENTRAX_FORCE_PRODUCTION !== "1"
  );
}

/**
 * Validates a destination. Hostnames that are not literal IPs pass the address
 * checks — resolution happens at connect time — so this is one layer, not the
 * whole defense; the deployment blocks egress to internal ranges as well.
 */
export function checkOutboundUrl(raw: string | null | undefined): UrlCheck {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, reason: "INVALID_URL", detail: "URL is empty." };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "INVALID_URL", detail: "URL could not be parsed." };
  }

  if (!(ALLOWED_PROTOCOLS as readonly string[]).includes(url.protocol)) {
    return {
      ok: false,
      reason: "UNSUPPORTED_PROTOCOL",
      detail: `Protocol ${url.protocol} is not allowed.`,
    };
  }

  // Credentials in a delivery URL end up in logs and configuration exports.
  if (url.username || url.password) {
    return {
      ok: false,
      reason: "CREDENTIALS_IN_URL",
      detail: "Credentials must not be embedded in the URL.",
    };
  }

  const host = bareHost(url.hostname);

  if (METADATA_HOSTS.has(host)) {
    return { ok: false, reason: "METADATA_ADDRESS", detail: "Instance metadata is not reachable." };
  }

  if (isLinkLocalAddress(host)) {
    return { ok: false, reason: "LINK_LOCAL_ADDRESS", detail: "Link-local addresses are blocked." };
  }

  if (isLoopbackAddress(host) || BLOCKED_HOSTNAMES.has(host)) {
    if (loopbackAllowed()) return { ok: true, url };
    return { ok: false, reason: "LOOPBACK_ADDRESS", detail: "Loopback addresses are blocked." };
  }

  if (isPrivateAddress(host)) {
    return { ok: false, reason: "PRIVATE_ADDRESS", detail: "Private addresses are blocked." };
  }

  return { ok: true, url };
}

export function assertOutboundUrl(raw: string | null | undefined): URL {
  const result = checkOutboundUrl(raw);
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`);
  return result.url;
}
