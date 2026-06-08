import type { RuntimeEnv } from "./runtime-config.js";

export interface ReleaseMetadata {
  buildTime: string;
  revision: string;
  service: string;
  source: string;
  version: string;
}

export function loadReleaseMetadata(env: RuntimeEnv, service: string): ReleaseMetadata {
  return {
    buildTime: readReleaseValue(env.FOCOCONTEXT_RELEASE_BUILD_TIME, "unknown"),
    revision: readReleaseValue(env.FOCOCONTEXT_RELEASE_REVISION, "unknown"),
    service,
    source: readReleaseValue(env.FOCOCONTEXT_RELEASE_SOURCE, "local"),
    version: readReleaseValue(env.FOCOCONTEXT_RELEASE_VERSION, "dev"),
  };
}

function readReleaseValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? fallback : normalized;
}
