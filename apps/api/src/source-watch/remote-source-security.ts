import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { ApiError } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

export type RemoteSourceRejectionReason =
  | "credentials_not_allowed"
  | "invalid_url"
  | "metadata_service_blocked"
  | "private_network_blocked"
  | "unsupported_protocol";

export interface RemoteSourceSecurityPolicy {
  allowedProtocols: readonly string[];
  privateNetworkAllowlist: readonly string[];
  privateNetworkEnabled: boolean;
}

export type RemoteSourceAddressResolver = (hostname: string) => Promise<readonly string[]>;

export type RemoteSourceInspectionResult =
  | {
      ok: true;
      url: URL;
    }
  | {
      details: Record<string, unknown>;
      ok: false;
      reason: RemoteSourceRejectionReason;
    };

export function createRemoteSourceSecurityPolicy(
  config: RuntimeConfig,
  allowedProtocols: readonly string[],
): RemoteSourceSecurityPolicy {
  return {
    allowedProtocols: normalizeProtocols(allowedProtocols),
    privateNetworkAllowlist: config.sourceWatch.remoteSecurity.privateNetworkAllowlist,
    privateNetworkEnabled: config.sourceWatch.remoteSecurity.privateNetworkEnabled,
  };
}

export function validateRemoteSourceUrl(value: string, policy: RemoteSourceSecurityPolicy): URL {
  const result = inspectRemoteSourceUrl(value, policy);

  if (result.ok) {
    return result.url;
  }

  throw new ApiError("invalid_request", {
    message: createRemoteSourceErrorMessage(result.reason),
    messageKey: "api.validation.remote_source_unsafe",
    details: result.details,
  });
}

export async function validateRemoteSourceUrlWithDns(
  value: string,
  policy: RemoteSourceSecurityPolicy,
  resolver: RemoteSourceAddressResolver = resolveHostnameAddresses,
): Promise<URL> {
  const url = validateRemoteSourceUrl(value, policy);
  const hostname = normalizeHostname(url.hostname);

  if (isIP(hostname) !== 0) {
    return url;
  }

  const addresses = await resolver(hostname);

  if (addresses.length === 0) {
    throw new ApiError("invalid_request", {
      message: "Remote source hostname did not resolve.",
      messageKey: "api.validation.remote_source_unsafe",
      details: {
        host: hostname,
        reason: "invalid_url",
      },
    });
  }

  for (const address of addresses) {
    const result = inspectRemoteSourceHostname(address, policy);

    if (!result.ok) {
      throw new ApiError("invalid_request", {
        message: createRemoteSourceErrorMessage(result.reason),
        messageKey: "api.validation.remote_source_unsafe",
        details: {
          ...result.details,
          host: hostname,
          resolved_address: address,
        },
      });
    }
  }

  return url;
}

export function validateRemoteSourceRedirectChain(
  values: readonly string[],
  policy: RemoteSourceSecurityPolicy,
  redirectLimit: number,
): URL[] {
  if (values.length === 0) {
    throw new ApiError("invalid_request", {
      message: "Remote source redirect chain is empty.",
      messageKey: "api.validation.remote_source_unsafe",
      details: {
        reason: "invalid_url",
      },
    });
  }

  const redirectCount = Math.max(0, values.length - 1);

  if (redirectCount > redirectLimit) {
    throw new ApiError("invalid_request", {
      message: "Remote source redirect limit exceeded.",
      messageKey: "api.validation.remote_source_unsafe",
      details: {
        redirect_count: redirectCount,
        redirect_limit: redirectLimit,
        reason: "redirect_limit_exceeded",
      },
    });
  }

  return values.map((value) => validateRemoteSourceUrl(value, policy));
}

export function inspectRemoteSourceUrl(
  value: string,
  policy: RemoteSourceSecurityPolicy,
): RemoteSourceInspectionResult {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return rejectRemoteSource("invalid_url", { fields: ["url"] });
  }

  const protocol = url.protocol.replace(/:$/u, "").toLowerCase();
  const allowedProtocols = normalizeProtocols(policy.allowedProtocols);

  if (!allowedProtocols.includes(protocol)) {
    return rejectRemoteSource("unsupported_protocol", {
      allowed_protocols: allowedProtocols,
      protocol,
    });
  }

  if (url.username.length > 0 || url.password.length > 0) {
    return rejectRemoteSource("credentials_not_allowed", {
      host: normalizeHostname(url.hostname),
    });
  }

  const hostname = normalizeHostname(url.hostname);

  if (hostname.length === 0) {
    return rejectRemoteSource("invalid_url", { fields: ["url"] });
  }

  return inspectRemoteSourceHostname(hostname, policy, url);
}

function inspectRemoteSourceHostname(
  hostname: string,
  policy: RemoteSourceSecurityPolicy,
  url?: URL,
): RemoteSourceInspectionResult {
  const destination = classifyRemoteDestination(hostname);

  if (destination === "metadata") {
    return rejectRemoteSource("metadata_service_blocked", {
      host: hostname,
    });
  }

  if (destination === "private" && !isPrivateNetworkAllowed(hostname, policy)) {
    return rejectRemoteSource("private_network_blocked", {
      host: hostname,
      private_network_enabled: policy.privateNetworkEnabled,
      private_network_allowlist_configured: policy.privateNetworkAllowlist.length > 0,
    });
  }

  return {
    ok: true,
    url: url ?? new URL(`http://${isIP(hostname) === 6 ? `[${hostname}]` : hostname}`),
  };
}

async function resolveHostnameAddresses(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });

  return records.map((record) => record.address);
}

function rejectRemoteSource(
  reason: RemoteSourceRejectionReason,
  details: Record<string, unknown>,
): RemoteSourceInspectionResult {
  return {
    details: {
      ...details,
      reason,
    },
    ok: false,
    reason,
  };
}

function createRemoteSourceErrorMessage(reason: RemoteSourceRejectionReason): string {
  if (reason === "unsupported_protocol") {
    return "Unsupported remote source protocol.";
  }
  if (reason === "credentials_not_allowed") {
    return "Remote source URL credentials are not allowed.";
  }
  if (reason === "metadata_service_blocked") {
    return "Remote source metadata-service destination is blocked.";
  }
  if (reason === "private_network_blocked") {
    return "Remote source private-network destination is blocked.";
  }

  return "Remote source URL is invalid.";
}

function normalizeProtocols(protocols: readonly string[]): string[] {
  return [...new Set(protocols.map((item) => item.trim().replace(/:$/u, "").toLowerCase()))].filter(
    Boolean,
  );
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
}

function classifyRemoteDestination(hostname: string): "metadata" | "private" | "public" {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return "private";
  }

  if (isMetadataServiceHost(hostname)) {
    return "metadata";
  }

  const ipVersion = isIP(hostname);

  if (ipVersion === 4) {
    return isPrivateIpv4(hostname) ? "private" : "public";
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(hostname) ? "private" : "public";
  }

  return "public";
}

function isMetadataServiceHost(hostname: string): boolean {
  return (
    hostname === "169.254.169.254" ||
    hostname === "169.254.170.2" ||
    hostname === "metadata.google.internal"
  );
}

function isPrivateIpv4(value: string): boolean {
  const octets = parseIpv4(value);

  if (octets === null) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff")
  );
}

function isPrivateNetworkAllowed(hostname: string, policy: RemoteSourceSecurityPolicy): boolean {
  if (!policy.privateNetworkEnabled || policy.privateNetworkAllowlist.length === 0) {
    return false;
  }

  return policy.privateNetworkAllowlist.some((entry) => isAllowlistMatch(hostname, entry));
}

function isAllowlistMatch(hostname: string, entry: string): boolean {
  const normalizedEntry = entry.trim().toLowerCase();

  if (normalizedEntry.length === 0) {
    return false;
  }

  if (normalizedEntry === hostname) {
    return true;
  }

  if (normalizedEntry.includes("/") && isIP(hostname) === 4) {
    return isIpv4CidrMatch(hostname, normalizedEntry);
  }

  return false;
}

function isIpv4CidrMatch(hostname: string, cidr: string): boolean {
  const [base, prefixText] = cidr.split("/");
  const baseOctets = parseIpv4(base ?? "");
  const targetOctets = parseIpv4(hostname);
  const prefix = Number(prefixText);

  if (baseOctets === null || targetOctets === null || !Number.isInteger(prefix)) {
    return false;
  }
  if (prefix < 0 || prefix > 32) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

  return (ipv4ToNumber(baseOctets) & mask) === (ipv4ToNumber(targetOctets) & mask);
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));

  if (!octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return null;
  }

  return octets as [number, number, number, number];
}

function ipv4ToNumber(octets: [number, number, number, number]): number {
  return (
    ((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + octets[3]
  );
}
