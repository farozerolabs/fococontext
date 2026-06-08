import { ApiError } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";
import { isAbsolute, relative, resolve } from "node:path";

import {
  sourceWatchSourceKinds,
  type CreateSourceWatchRuleInput,
  type ScheduledImportJobRecord,
  type ScheduledImportJobResponse,
  type SourceWatchDiscoveredSource,
  type SourceWatchLatestScanResponse,
  type SourceWatchRuleRecord,
  type SourceWatchRuleResponse,
  type SourceWatchRuleSchedule,
  type SourceWatchRuleScheduleResponse,
  type SourceWatchScanSource,
  type SourceWatchSourceKind,
  type UpdateSourceWatchRuleInput,
} from "./source-watch.types.js";

export function toSourceWatchRuleResponse(
  record: SourceWatchRuleRecord,
  config: RuntimeConfig,
): SourceWatchRuleResponse {
  return {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    name: record.name,
    source_kind: record.sourceKind,
    location: record.location,
    credential_profile: record.credentialProfile,
    adapter_options: { ...record.adapterOptions },
    include_extensions: record.includeExtensions,
    exclude_dirs: record.excludeDirs,
    exclude_globs: record.excludeGlobs,
    max_file_size_mb: record.maxFileSizeMb,
    auto_ingest: record.autoIngest,
    status: record.status,
    schedule: toSourceWatchScheduleResponse(record.schedule),
    latest_scan: record.latestScan,
    execution: getSourceWatchRuleExecution(record, config),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function getSourceWatchRuleExecution(record: SourceWatchRuleRecord, config: RuntimeConfig) {
  if (record.status !== "enabled") {
    return {
      enabled: false,
      reason: "source_watch_execution_not_configured" as const,
    };
  }

  const adapter = getSourceWatchAdapterReadiness(record.sourceKind, config);

  if (adapter.enabled) {
    return {
      enabled: true,
    };
  }

  return {
    enabled: false,
    reason: adapter.reason,
  };
}

export function toScheduledImportJobResponse(
  record: ScheduledImportJobRecord,
): ScheduledImportJobResponse {
  return {
    id: record.id,
    source_watch_rule_id: record.sourceWatchRuleId,
    knowledge_base_id: record.knowledgeBaseId,
    status: record.status,
    trigger_type: record.triggerType,
    scan_result: record.scanResult,
    started_at: record.startedAt,
    finished_at: record.finishedAt,
    duration_ms: record.durationMs,
    retry_count: record.retryCount,
    retryable: record.retryable,
    next_retry_at: record.nextRetryAt,
    error: record.error,
    scheduled_for: record.scheduledFor,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function createLatestScan(record: ScheduledImportJobRecord): SourceWatchLatestScanResponse {
  return {
    scheduled_import_job_id: record.id,
    status: record.status,
    scanned_at: record.createdAt,
    new_source_count: record.scanResult.new_sources.length,
    changed_source_count: record.scanResult.changed_sources.length,
    delete_candidate_count: record.scanResult.delete_candidates.length,
    skipped_count: record.scanResult.skipped.length,
  };
}

export function toScanSourceResponse(item: SourceWatchDiscoveredSource): SourceWatchScanSource {
  const response: SourceWatchScanSource = {
    name: item.name,
  };

  if (item.source_path !== undefined) {
    response.source_path = item.source_path;
  }
  if (item.source_url !== undefined) {
    response.source_url = item.source_url;
  }
  if (item.content_hash !== undefined) {
    response.content_hash = item.content_hash;
  }
  if (item.size !== undefined) {
    response.size = item.size;
  }
  if (item.metadata !== undefined) {
    response.metadata = { ...item.metadata };
  }

  return response;
}

export function cloneDeleteCandidate<T extends { metadata?: Record<string, unknown> }>(item: T): T {
  return {
    ...item,
    ...(item.metadata === undefined
      ? {}
      : {
          metadata: { ...item.metadata },
        }),
  };
}

export function cloneSkippedSource<T extends { metadata?: Record<string, unknown> }>(item: T): T {
  return cloneDeleteCandidate(item);
}

export function createSourceWatchIdempotencyKey(
  record: SourceWatchRuleRecord,
  source: SourceWatchDiscoveredSource,
): string {
  return [
    "source-watch",
    record.id,
    source.source_path ?? source.name,
    source.content_hash ?? "unknown",
  ].join(":");
}

export function readRequiredString(value: string | undefined, field: string): string {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_watch_field_required",
      details: {
        fields: [field],
      },
    });
  }

  return trimmed;
}

export function readOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function readNullableString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

export function readOptionalObject(
  value: Record<string, unknown> | undefined,
  field: string,
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_watch_object_invalid",
      details: {
        fields: [field],
      },
    });
  }

  return { ...value };
}

export function readSourceKind(value: SourceWatchSourceKind | undefined): SourceWatchSourceKind {
  if (value !== undefined && sourceWatchSourceKinds.includes(value)) {
    return value;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.source_watch_kind_invalid",
    details: {
      fields: ["source_kind"],
    },
  });
}

export function assertSupportedRuntimeSourceKind(
  value: SourceWatchSourceKind,
  config: RuntimeConfig,
): void {
  const supportedKinds = readRuntimeSupportedKinds(config);

  if (supportedKinds.includes(value)) {
    return;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.source_watch_kind_unsupported",
    details: {
      fields: ["source_kind"],
      supported_kinds: supportedKinds,
    },
  });
}

function readRuntimeSupportedKinds(config: RuntimeConfig): SourceWatchSourceKind[] {
  const values: SourceWatchSourceKind[] = [];

  if (config.sourceWatch.adapters.mountedDirectory.enabled) {
    values.push("mounted_directory");
  }
  if (config.sourceWatch.adapters.s3Prefix.enabled) {
    values.push("s3_prefix");
  }
  if (config.sourceWatch.adapters.urlList.enabled) {
    values.push("url_list");
  }
  if (config.sourceWatch.adapters.gitRepo.enabled) {
    values.push("git_repo");
  }

  return values;
}

function getSourceWatchAdapterReadiness(
  sourceKind: SourceWatchSourceKind,
  config: RuntimeConfig,
):
  | { enabled: true }
  | {
      enabled: false;
      reason: "source_watch_adapter_disabled" | "source_watch_credentials_missing";
    } {
  if (sourceKind === "mounted_directory") {
    return config.sourceWatch.adapters.mountedDirectory.enabled
      ? { enabled: true }
      : { enabled: false, reason: "source_watch_adapter_disabled" };
  }
  if (sourceKind === "url_list") {
    return config.sourceWatch.adapters.urlList.enabled
      ? { enabled: true }
      : { enabled: false, reason: "source_watch_adapter_disabled" };
  }
  if (sourceKind === "s3_prefix") {
    const adapter = config.sourceWatch.adapters.s3Prefix;

    if (!adapter.enabled) {
      return { enabled: false, reason: "source_watch_adapter_disabled" };
    }
    if (!adapter.accessKeyConfigured || !adapter.secretKeyConfigured) {
      return { enabled: false, reason: "source_watch_credentials_missing" };
    }

    return { enabled: true };
  }

  const adapter = config.sourceWatch.adapters.gitRepo;

  return adapter.enabled
    ? { enabled: true }
    : { enabled: false, reason: "source_watch_adapter_disabled" };
}

export function createSourceWatchSchedule(
  input: CreateSourceWatchRuleInput["schedule"],
  now: string,
  config: RuntimeConfig,
): SourceWatchRuleSchedule {
  const enabled = input?.enabled ?? false;
  const intervalSeconds =
    input?.interval_seconds === undefined
      ? enabled
        ? config.sourceWatch.scheduler.defaultIntervalSeconds
        : null
      : readOptionalPositiveNumber(input.interval_seconds, "schedule.interval_seconds");
  const cron = readNullableString(input?.cron);
  const timezone = readNullableString(input?.timezone);

  return {
    enabled,
    intervalSeconds,
    cron,
    timezone,
    nextRunAt: enabled ? calculateNextRunAt(now, intervalSeconds) : null,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    schedulerStatus: enabled ? "scheduled" : "disabled",
  };
}

export function updateSourceWatchSchedule(
  current: SourceWatchRuleSchedule,
  input: NonNullable<UpdateSourceWatchRuleInput["schedule"]>,
  now: string,
  config: RuntimeConfig,
): SourceWatchRuleSchedule {
  const enabled = input.enabled ?? current.enabled;
  const intervalSeconds =
    input.interval_seconds === undefined
      ? (current.intervalSeconds ?? config.sourceWatch.scheduler.defaultIntervalSeconds)
      : readOptionalPositiveNumber(input.interval_seconds, "schedule.interval_seconds");
  const cron = input.cron === undefined ? current.cron : readNullableString(input.cron);
  const timezone =
    input.timezone === undefined ? current.timezone : readNullableString(input.timezone);

  return {
    ...current,
    enabled,
    intervalSeconds,
    cron,
    timezone,
    nextRunAt: enabled ? calculateNextRunAt(now, intervalSeconds) : null,
    schedulerStatus: enabled ? "scheduled" : "disabled",
  };
}

export function pauseSourceWatchSchedule(
  schedule: SourceWatchRuleSchedule,
): SourceWatchRuleSchedule {
  return {
    ...schedule,
    nextRunAt: null,
    schedulerStatus: schedule.enabled ? "paused" : "disabled",
  };
}

export function resumeSourceWatchSchedule(
  schedule: SourceWatchRuleSchedule,
  now: string,
): SourceWatchRuleSchedule {
  return {
    ...schedule,
    nextRunAt: schedule.enabled ? calculateNextRunAt(now, schedule.intervalSeconds) : null,
    schedulerStatus: schedule.enabled ? "scheduled" : "disabled",
  };
}

export function completeSourceWatchSchedule(
  schedule: SourceWatchRuleSchedule,
  job: ScheduledImportJobRecord,
  now: string,
): SourceWatchRuleSchedule {
  return {
    ...schedule,
    lastRunAt: job.finishedAt ?? now,
    lastStatus: job.status,
    lastError: job.error,
    nextRunAt:
      schedule.enabled && job.status !== "disabled"
        ? calculateNextRunAt(now, schedule.intervalSeconds)
        : null,
    schedulerStatus:
      schedule.enabled && job.status !== "disabled" ? "scheduled" : schedule.schedulerStatus,
  };
}

function toSourceWatchScheduleResponse(
  schedule: SourceWatchRuleSchedule,
): SourceWatchRuleScheduleResponse {
  return {
    enabled: schedule.enabled,
    interval_seconds: schedule.intervalSeconds,
    cron: schedule.cron,
    timezone: schedule.timezone,
    next_run_at: schedule.nextRunAt,
    last_run_at: schedule.lastRunAt,
    last_status: schedule.lastStatus,
    last_error: schedule.lastError,
    scheduler_status: schedule.schedulerStatus,
  };
}

function calculateNextRunAt(now: string, intervalSeconds: number | null): string | null {
  if (intervalSeconds === null) {
    return null;
  }

  return new Date(new Date(now).getTime() + intervalSeconds * 1000).toISOString();
}

export function calculateRetryAt(now: string, retryBaseDelayMs: number): string {
  return new Date(new Date(now).getTime() + retryBaseDelayMs).toISOString();
}

export function toErrorRecord(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: "Error",
  };
}

export function isRetryableSourceWatchError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return false;
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  return !["ENOENT", "EACCES", "EINVAL"].includes(code);
}

export function assertDatasetSupportsSourceKind(
  value: SourceWatchSourceKind,
  sourceWatchConfiguration: Record<string, unknown>,
): void {
  const supportedKinds = readDatasetSupportedKinds(sourceWatchConfiguration);

  if (supportedKinds.includes(value)) {
    return;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.source_watch_kind_disabled",
    details: {
      fields: ["source_kind"],
      supported_kinds: supportedKinds,
    },
  });
}

function readDatasetSupportedKinds(
  sourceWatchConfiguration: Record<string, unknown>,
): SourceWatchSourceKind[] {
  const rawSupportedKinds = sourceWatchConfiguration.supported_kinds;

  if (!Array.isArray(rawSupportedKinds)) {
    return [];
  }

  return rawSupportedKinds.filter(isSourceWatchSourceKind);
}

function isSourceWatchSourceKind(value: unknown): value is SourceWatchSourceKind {
  return (
    typeof value === "string" && sourceWatchSourceKinds.includes(value as SourceWatchSourceKind)
  );
}

export function validateSourceWatchLocation(
  sourceKind: SourceWatchSourceKind,
  location: string,
  config: RuntimeConfig,
): void {
  if (sourceKind === "mounted_directory") {
    validateMountedDirectoryLocation(location, config.sourceWatch.containerDir);
    return;
  }

  if (sourceKind === "url_list") {
    validateUrlListLocation(location, config.sourceWatch.adapters.urlList.allowedProtocols);
    return;
  }

  if (sourceKind === "s3_prefix") {
    validateS3PrefixLocation(location);
    return;
  }

  validateGitRepositoryLocation(location, config.sourceWatch.adapters.gitRepo.allowedProtocols);
}

function validateUrlListLocation(location: string, allowedProtocols: readonly string[]): void {
  const urls = location
    .split(/\r?\n|,/u)
    .map((item) => item.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_watch_url_list_invalid",
      details: {
        fields: ["location"],
      },
    });
  }

  for (const url of urls) {
    const parsed = parseUrl(url);

    if (parsed === null || !allowedProtocols.includes(parsed.protocol.replace(/:$/u, ""))) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.source_watch_url_list_invalid",
        details: {
          fields: ["location"],
          allowed_protocols: [...allowedProtocols],
        },
      });
    }
  }
}

function validateS3PrefixLocation(location: string): void {
  if (/^s3:\/\/[^/]+\/?.*/u.test(location.trim())) {
    return;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.source_watch_s3_location_invalid",
    details: {
      fields: ["location"],
    },
  });
}

function validateGitRepositoryLocation(
  location: string,
  allowedProtocols: readonly string[],
): void {
  const parsed = parseUrl(location);

  if (parsed !== null && allowedProtocols.includes(parsed.protocol.replace(/:$/u, ""))) {
    return;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.source_watch_git_location_invalid",
    details: {
      fields: ["location"],
      allowed_protocols: [...allowedProtocols],
    },
  });
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function validateMountedDirectoryLocation(location: string, containerDir: string): void {
  if (!isAbsolute(location)) {
    throw createMountedDirectoryLocationError(containerDir);
  }

  const mountRoot = normalizeAbsolutePath(containerDir);
  const target = normalizeAbsolutePath(location);
  const relativePath = relative(mountRoot, target);

  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return;
  }

  throw createMountedDirectoryLocationError(containerDir);
}

function normalizeAbsolutePath(value: string): string {
  const normalized = resolve(value.trim());

  return normalized === "/" ? normalized : normalized.replace(/\/+$/u, "");
}

function createMountedDirectoryLocationError(containerDir: string): ApiError {
  return new ApiError("invalid_request", {
    messageKey: "api.validation.source_watch_mounted_directory_location_invalid",
    details: {
      fields: ["location"],
      container_dir: normalizeAbsolutePath(containerDir),
    },
  });
}

export function readStringArray(value: string[] | undefined, field: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_watch_list_invalid",
      details: {
        fields: [field],
      },
    });
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

export function readOptionalPositiveNumber(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_watch_number_invalid",
      details: {
        fields: [field],
      },
    });
  }

  return value;
}
