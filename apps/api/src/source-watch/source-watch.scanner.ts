import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, opendir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { RuntimeConfig } from "@fococontext/core";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  recordObjectStorageOperation,
  S3Client,
  type ObjectStorageOperationRecorder,
} from "@fococontext/storage";

import type {
  SourceWatchDiscoveredSource,
  SourceWatchRuleRecord,
  SourceWatchScanDiscovery,
  SourceWatchScanItemKind,
  SourceWatchScanStageItem,
  SourceWatchSkippedSource,
} from "./source-watch.types.js";
import {
  createRemoteSourceSecurityPolicy,
  inspectRemoteSourceUrl,
  validateRemoteSourceUrlWithDns,
  type RemoteSourceSecurityPolicy,
} from "./remote-source-security.js";

export const sourceWatchScannerToken = Symbol("sourceWatchScanner");
const execFileAsync = promisify(execFile);

export interface SourceWatchScanner {
  scan(
    rule: SourceWatchRuleRecord,
    options?: SourceWatchScannerRuntimeOptions,
  ): Promise<SourceWatchScanDiscovery>;
}

export interface SourceWatchScannerRuntimeOptions {
  onProgress?: (progress: SourceWatchScannerProgress) => Promise<void>;
  resumeCursor?: Record<string, unknown>;
  scanRunId?: string;
}

export interface SourceWatchScannerProgress {
  cursor?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  processedCount: number;
  stage: "adapter_page" | "compare" | "completed";
  totalCount?: number | null;
}

interface SourceWatchS3Object {
  ETag?: string;
  Key?: string;
  LastModified?: Date;
  Size?: number;
}

interface SourceWatchListObjectsV2Output {
  Contents?: SourceWatchS3Object[];
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}

interface SourceWatchGetObjectOutput {
  Body?: unknown;
}

export interface SourceWatchS3Client {
  send(command: unknown): Promise<unknown>;
}

export interface SourceWatchS3ClientFactoryInput {
  accessKeyId: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
  secretAccessKey: string;
}

export interface SourceWatchExistingDocumentProvider {
  compareDiscoveredSources(
    rule: SourceWatchRuleRecord,
    scannedSources: readonly SourceWatchDiscoveredSource[],
  ): Promise<{
    changedSources: SourceWatchDiscoveredSource[];
    deleteCandidates: SourceWatchScanDiscovery["deleteCandidates"];
    newSources: SourceWatchDiscoveredSource[];
  } | null>;
  hasMatchingFingerprint(
    rule: SourceWatchRuleRecord,
    sourcePath: string,
    fingerprint: string,
  ): Promise<boolean | null>;
}

export interface SourceWatchScannerOptions {
  comparisonWindowSize?: number;
  existingDocumentProvider?: SourceWatchExistingDocumentProvider;
  operationRecorder?: ObjectStorageOperationRecorder;
  s3ClientFactory?: (input: SourceWatchS3ClientFactoryInput) => SourceWatchS3Client;
  stageScanItems?: (input: {
    items: readonly SourceWatchScanStageItem[];
    rule: SourceWatchRuleRecord;
    scanRunId: string;
  }) => Promise<void>;
}

export function createDefaultSourceWatchScanner(
  config: RuntimeConfig,
  options: SourceWatchScannerOptions = {},
): SourceWatchScanner {
  const scannerOptions = {
    ...options,
    comparisonWindowSize:
      options.comparisonWindowSize ?? config.limits.residualMemory.sourceWatch.windowSize,
  };

  return {
    async scan(rule, runtimeOptions) {
      if (rule.status === "disabled") {
        return createDisabledDiscovery();
      }

      if (rule.sourceKind === "mounted_directory") {
        return scanMountedDirectory(rule, scannerOptions, runtimeOptions);
      }
      if (rule.sourceKind === "url_list") {
        return scanUrlList(rule, config, scannerOptions, runtimeOptions);
      }
      if (rule.sourceKind === "s3_prefix") {
        return scanS3Prefix(rule, config, scannerOptions, runtimeOptions);
      }
      if (rule.sourceKind === "git_repo") {
        return scanGitRepository(rule, config, scannerOptions, runtimeOptions);
      }

      return createDisabledDiscovery("source_watch_adapter_disabled");
    },
  };
}

export function createDisabledSourceWatchScanner(): SourceWatchScanner {
  return {
    async scan() {
      return createDisabledDiscovery();
    },
  };
}

async function scanMountedDirectory(
  rule: SourceWatchRuleRecord,
  options: SourceWatchScannerOptions,
  runtimeOptions?: SourceWatchScannerRuntimeOptions,
): Promise<SourceWatchScanDiscovery> {
  const root = resolve(rule.location);
  const rootStatus = await stat(root).catch(() => null);

  if (rootStatus === null || !rootStatus.isDirectory()) {
    return {
      status: "failed",
      newSources: [],
      changedSources: [],
      deleteCandidates: [],
      skipped: [
        {
          source_path: normalizeSourcePath(rule.location),
          reason: "location_not_found",
        },
      ],
      execution: {
        enabled: true,
      },
    };
  }

  const accumulator = createSourceWatchStageAccumulator(options, runtimeOptions, rule);
  const scanStats = await collectMountedDirectorySources(rule, root, accumulator);
  await accumulator.flush();
  await runtimeOptions?.onProgress?.({
    metadata: {
      adapter: "mounted_directory",
      skipped_count: scanStats.skippedCount,
    },
    processedCount: scanStats.discoveredCount,
    stage: "adapter_page",
    totalCount: scanStats.discoveredCount,
  });

  return {
    status: "completed",
    newSources: [],
    changedSources: [],
    deleteCandidates: [],
    skipped: [],
    execution: {
      enabled: true,
    },
  };
}

async function scanUrlList(
  rule: SourceWatchRuleRecord,
  config: RuntimeConfig,
  options: SourceWatchScannerOptions,
  runtimeOptions?: SourceWatchScannerRuntimeOptions,
): Promise<SourceWatchScanDiscovery> {
  const adapter = config.sourceWatch.adapters.urlList;

  if (!adapter.enabled) {
    return createDisabledDiscovery("source_watch_adapter_disabled");
  }

  const skipped: SourceWatchSkippedSource[] = [];
  const sources = collectUrlListSources(
    rule,
    adapter,
    createRemoteSourceSecurityPolicy(config, adapter.allowedProtocols),
    skipped,
  );
  await stageSourceWatchItems(options, runtimeOptions, rule, [
    ...toSourceWatchStageItems("discovered", sources),
    ...toSourceWatchSkippedStageItems(skipped),
  ]);
  await runtimeOptions?.onProgress?.({
    metadata: {
      adapter: "url_list",
      request_local_input: true,
      small_url_list_limit: config.limits.residualMemory.sourceWatch.smallUrlListLimit,
      skipped_count: skipped.length,
    },
    processedCount: sources.length,
    stage: "adapter_page",
    totalCount: sources.length,
  });

  return {
    status: "completed",
    newSources: [],
    changedSources: [],
    deleteCandidates: [],
    skipped: [],
    execution: {
      enabled: true,
    },
  };
}

function collectUrlListSources(
  rule: SourceWatchRuleRecord,
  adapter: RuntimeConfig["sourceWatch"]["adapters"]["urlList"],
  policy: RemoteSourceSecurityPolicy,
  skipped: SourceWatchSkippedSource[],
): SourceWatchDiscoveredSource[] {
  const values = rule.location
    .split(/\r?\n|,/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const seenUrls = new Set<string>();
  const sources: SourceWatchDiscoveredSource[] = [];

  values.forEach((value, index) => {
    if (index >= adapter.maxItems) {
      skipped.push({
        source_path: value,
        reason: "url_list_limit_exceeded",
        metadata: {
          max_urls: adapter.maxItems,
        },
      });
      return;
    }

    const inspected = inspectRemoteSourceUrl(value, policy);

    if (!inspected.ok) {
      skipped.push({
        source_path: value,
        reason: inspected.reason,
        metadata: {
          remote_source_error: inspected.details,
        },
      });
      return;
    }

    const parsed = inspected.url;
    const normalizedUrl = parsed.toString();

    if (seenUrls.has(normalizedUrl)) {
      skipped.push({
        source_path: normalizedUrl,
        reason: "duplicate_url",
      });
      return;
    }

    seenUrls.add(normalizedUrl);
    sources.push({
      name: createUrlSourceName(parsed),
      source_path: normalizedUrl,
      source_url: normalizedUrl,
      content_hash: `sha256:${createHash("sha256").update(normalizedUrl).digest("hex")}`,
      metadata: {
        source_watch_rule_id: rule.id,
        source_watch_source_kind: rule.sourceKind,
        source_watch_location: rule.location,
        source_watch_adapter: "url_list",
      },
      ingest: {
        kind: "url",
        url: normalizedUrl,
      },
    });
  });

  return sources.sort((a, b) => (a.source_path ?? a.name).localeCompare(b.source_path ?? b.name));
}

async function scanS3Prefix(
  rule: SourceWatchRuleRecord,
  config: RuntimeConfig,
  options: SourceWatchScannerOptions,
  runtimeOptions?: SourceWatchScannerRuntimeOptions,
): Promise<SourceWatchScanDiscovery> {
  const adapter = config.sourceWatch.adapters.s3Prefix;

  if (!adapter.enabled) {
    return createDisabledDiscovery("source_watch_adapter_disabled");
  }
  if (
    adapter.endpoint === undefined ||
    adapter.region === undefined ||
    adapter.accessKeyId === undefined ||
    adapter.secretAccessKey === undefined
  ) {
    return createDisabledDiscovery("source_watch_credentials_missing");
  }

  const location = parseS3Location(rule.location, adapter.bucket);

  if (location === null) {
    return createFailedDiscovery(rule.location, "invalid_s3_location");
  }

  const client =
    options.s3ClientFactory?.({
      accessKeyId: adapter.accessKeyId,
      endpoint: adapter.endpoint,
      forcePathStyle: adapter.forcePathStyle,
      region: adapter.region,
      secretAccessKey: adapter.secretAccessKey,
    }) ??
    new S3Client({
      credentials: {
        accessKeyId: adapter.accessKeyId,
        secretAccessKey: adapter.secretAccessKey,
      },
      endpoint: adapter.endpoint,
      forcePathStyle: adapter.forcePathStyle,
      region: adapter.region,
    });
  const operationRecorder = options.operationRecorder;

  if (operationRecorder === undefined) {
    return createFailedDiscovery(rule.location, "source_watch_operation_recorder_missing");
  }

  const accumulator = createSourceWatchStageAccumulator(options, runtimeOptions, rule);
  const scanStats = {
    discoveredCount: 0,
    skippedCount: 0,
  };
  let continuationToken = readOptionalCursorString(
    runtimeOptions?.resumeCursor?.continuation_token,
  );

  do {
    const page = (await recordObjectStorageOperation({
      caller: "source_watch.s3_prefix",
      enabled: config.limits.objectStorageOperations.metricsEnabled,
      operation: "ListObjectsV2",
      recorder: operationRecorder,
      run: () =>
        client.send(
          new ListObjectsV2Command({
            Bucket: location.bucket,
            ContinuationToken: continuationToken,
            MaxKeys: Math.min(adapter.maxItems - scanStats.discoveredCount, 1000),
            Prefix: location.prefix,
          }),
        ),
      scope: "source_watch",
    })) as SourceWatchListObjectsV2Output;

    for (const item of page.Contents ?? []) {
      if (scanStats.discoveredCount >= adapter.maxItems) {
        await stageSkippedSource(accumulator, scanStats, {
          ...(item.Key === undefined ? {} : { source_path: item.Key }),
          reason: "s3_object_limit_exceeded",
          metadata: {
            max_objects: adapter.maxItems,
          },
        });
        continue;
      }

      if (item.Key === undefined || item.Key.endsWith("/")) {
        continue;
      }

      if (!isIncludedExtension(item.Key, rule.includeExtensions)) {
        await stageSkippedSource(accumulator, scanStats, {
          source_path: item.Key,
          reason: "extension_not_included",
        });
        continue;
      }
      if (matchesAnyGlob(item.Key, rule.excludeGlobs)) {
        await stageSkippedSource(accumulator, scanStats, {
          source_path: item.Key,
          reason: "excluded_by_glob",
        });
        continue;
      }

      const size = item.Size ?? 0;
      const maxRuleBytes =
        rule.maxFileSizeMb === null ? Number.POSITIVE_INFINITY : rule.maxFileSizeMb * 1024 * 1024;
      const maxBytes = Math.min(adapter.maxBytes, maxRuleBytes);

      if (size > maxBytes) {
        await stageSkippedSource(accumulator, scanStats, {
          source_path: item.Key,
          reason: "file_too_large",
          metadata: {
            max_bytes: maxBytes,
            size,
          },
        });
        continue;
      }

      const sourcePath = `s3://${location.bucket}/${item.Key}`;
      const lastModified = item.LastModified?.toISOString();
      const fingerprint = createS3ObjectFingerprint({
        bucket: location.bucket,
        key: item.Key,
        etag: item.ETag,
        lastModified,
        rule,
        size,
      });
      const isUnchangedFingerprint =
        adapter.incrementalScanEnabled &&
        (await hasMatchingSourceWatchFingerprint(
          rule,
          options.existingDocumentProvider,
          sourcePath,
          fingerprint,
        ));
      const shouldReadContent = rule.autoIngest && !isUnchangedFingerprint;
      const content = shouldReadContent
        ? await readS3Object(
            client,
            location.bucket,
            item.Key,
            adapter.maxBytes,
            config,
            operationRecorder,
            size,
          )
        : undefined;
      const contentHash =
        content === undefined
          ? `sha256:${createHash("sha256").update(fingerprint).digest("hex")}`
          : `sha256:${createHash("sha256").update(content).digest("hex")}`;
      const tempIngest =
        content === undefined ? undefined : await writeTemporaryIngestFile(item.Key, content);

      await stageDiscoveredSource(accumulator, scanStats, {
        name: basename(item.Key),
        source_path: sourcePath,
        content_hash: contentHash,
        size,
        metadata: {
          source_watch_rule_id: rule.id,
          source_watch_source_kind: rule.sourceKind,
          source_watch_location: rule.location,
          source_watch_adapter: "s3_prefix",
          source_watch_fingerprint: fingerprint,
          source_watch_fingerprint_kind: "s3_list_metadata",
          s3_bucket: location.bucket,
          s3_key: item.Key,
          s3_size: size,
          ...(item.ETag === undefined ? {} : { s3_etag: item.ETag }),
          ...(lastModified === undefined ? {} : { s3_last_modified: lastModified }),
        },
        ...(tempIngest === undefined
          ? {}
          : {
              ingest: {
                kind: "file" as const,
                file_path: tempIngest.filePath,
                cleanup_path: tempIngest.cleanupPath,
                mime_type: inferMimeType(item.Key),
              },
            }),
      });
    }

    continuationToken = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    await runtimeOptions?.onProgress?.({
      cursor: {
        continuation_token: continuationToken ?? null,
      },
      metadata: {
        adapter: "s3_prefix",
        page_item_count: page.Contents?.length ?? 0,
        skipped_count: scanStats.skippedCount,
      },
      processedCount: scanStats.discoveredCount,
      stage: "adapter_page",
      totalCount: null,
    });
  } while (continuationToken !== undefined && scanStats.discoveredCount < adapter.maxItems);

  await accumulator.flush();
  await runtimeOptions?.onProgress?.({
    cursor: {
      comparison_source_offset: scanStats.discoveredCount,
      source_watch_rule_id: rule.id,
    },
    metadata: {
      changed_count: 0,
      comparison_window_size: options.comparisonWindowSize ?? scanStats.discoveredCount,
      delete_candidate_count: 0,
      failed_count: 0,
      new_count: 0,
      processed_source_count: scanStats.discoveredCount,
      skipped_count: scanStats.skippedCount,
    },
    processedCount: scanStats.discoveredCount,
    stage: "compare",
    totalCount: scanStats.discoveredCount,
  });

  return {
    status: "completed",
    newSources: [],
    changedSources: [],
    deleteCandidates: [],
    skipped: [],
    execution: {
      enabled: true,
    },
  };
}

async function scanGitRepository(
  rule: SourceWatchRuleRecord,
  config: RuntimeConfig,
  options: SourceWatchScannerOptions,
  runtimeOptions?: SourceWatchScannerRuntimeOptions,
): Promise<SourceWatchScanDiscovery> {
  const adapter = config.sourceWatch.adapters.gitRepo;

  if (!adapter.enabled) {
    return createDisabledDiscovery("source_watch_adapter_disabled");
  }

  try {
    await validateRemoteSourceUrlWithDns(
      rule.location,
      createRemoteSourceSecurityPolicy(config, adapter.allowedProtocols),
    );
  } catch {
    return createFailedDiscovery(rule.location, "invalid_git_repository");
  }

  const cloneRoot = await mkdtemp(join(tmpdir(), "fococontext-source-watch-git-"));
  const checkoutPath = join(cloneRoot, "repo");

  try {
    const ref = typeof rule.adapterOptions.ref === "string" ? rule.adapterOptions.ref : undefined;
    const cloneArgs = [
      "clone",
      "--depth",
      String(adapter.cloneDepth),
      ...(ref === undefined ? [] : ["--branch", ref]),
      rule.location,
      checkoutPath,
    ];

    await execFileAsync("git", cloneArgs, {
      timeout: adapter.timeoutSeconds * 1000,
    });

    const accumulator = createSourceWatchStageAccumulator(options, runtimeOptions, rule);
    const scanStats = await collectGitRepositorySources(rule, checkoutPath, adapter, accumulator);
    await accumulator.flush();
    await runtimeOptions?.onProgress?.({
      metadata: {
        adapter: "git_repo",
        skipped_count: scanStats.skippedCount,
      },
      processedCount: scanStats.discoveredCount,
      stage: "adapter_page",
      totalCount: scanStats.discoveredCount,
    });

    return {
      status: "completed",
      newSources: [],
      changedSources: [],
      deleteCandidates: [],
      skipped: [],
      execution: {
        enabled: true,
      },
    };
  } catch (error) {
    const failedItem = {
      source_path: rule.location,
      reason: "git_scan_failed",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
    await stageSourceWatchItems(options, runtimeOptions, rule, [
      toSourceWatchSkippedStageItem("failed", failedItem),
    ]);

    return {
      status: "failed",
      newSources: [],
      changedSources: [],
      deleteCandidates: [],
      skipped: [failedItem],
      execution: {
        enabled: true,
      },
    };
  } finally {
    await rm(cloneRoot, { force: true, recursive: true });
  }
}

async function collectGitRepositorySources(
  rule: SourceWatchRuleRecord,
  root: string,
  adapter: RuntimeConfig["sourceWatch"]["adapters"]["gitRepo"],
  accumulator: ReturnType<typeof createSourceWatchStageAccumulator>,
): Promise<{ discoveredCount: number; skippedCount: number }> {
  const stats = {
    discoveredCount: 0,
    skippedCount: 0,
  };

  await walkGitDirectory(rule, root, root, adapter, accumulator, stats);

  return stats;
}

async function walkGitDirectory(
  rule: SourceWatchRuleRecord,
  root: string,
  currentDirectory: string,
  adapter: RuntimeConfig["sourceWatch"]["adapters"]["gitRepo"],
  accumulator: ReturnType<typeof createSourceWatchStageAccumulator>,
  stats: { discoveredCount: number; skippedCount: number },
): Promise<void> {
  if (stats.discoveredCount >= adapter.maxItems) {
    return;
  }

  const directory = await opendir(currentDirectory);

  for await (const entry of directory) {
    const absolutePath = resolve(currentDirectory, entry.name);
    const relativePath = normalizeSourcePath(relative(root, absolutePath));

    if (entry.isDirectory()) {
      if (entry.name === ".git" || isExcludedDirectory(relativePath, rule.excludeDirs)) {
        await stageSkippedSource(accumulator, stats, {
          source_path: relativePath,
          reason: "excluded_directory",
        });
        continue;
      }

      await walkGitDirectory(rule, root, absolutePath, adapter, accumulator, stats);
      continue;
    }

    if (!entry.isFile()) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "unsupported_file_type",
      });
      continue;
    }
    if (stats.discoveredCount >= adapter.maxItems) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "git_file_limit_exceeded",
        metadata: {
          max_files: adapter.maxItems,
        },
      });
      continue;
    }
    if (!isIncludedExtension(relativePath, rule.includeExtensions)) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "extension_not_included",
      });
      continue;
    }
    if (matchesAnyGlob(relativePath, rule.excludeGlobs)) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "excluded_by_glob",
      });
      continue;
    }

    const fileStatus = await lstat(absolutePath);
    const maxRuleBytes =
      rule.maxFileSizeMb === null ? Number.POSITIVE_INFINITY : rule.maxFileSizeMb * 1024 * 1024;
    const maxBytes = Math.min(adapter.maxBytes, maxRuleBytes);

    if (fileStatus.size > maxBytes) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "file_too_large",
        metadata: {
          max_bytes: maxBytes,
          size: fileStatus.size,
        },
      });
      continue;
    }

    const content = await readFile(absolutePath);
    const tempIngest = rule.autoIngest
      ? await writeTemporaryIngestFile(relativePath, content)
      : undefined;

    await stageDiscoveredSource(accumulator, stats, {
      name: basename(relativePath),
      source_path: relativePath,
      content_hash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      size: content.byteLength,
      metadata: {
        source_watch_rule_id: rule.id,
        source_watch_source_kind: rule.sourceKind,
        source_watch_location: rule.location,
        source_watch_adapter: "git_repo",
      },
      ...(tempIngest === undefined
        ? {}
        : {
            ingest: {
              kind: "file" as const,
              file_path: tempIngest.filePath,
              cleanup_path: tempIngest.cleanupPath,
              mime_type: inferMimeType(relativePath),
            },
          }),
    });
  }
}

async function collectMountedDirectorySources(
  rule: SourceWatchRuleRecord,
  root: string,
  accumulator: ReturnType<typeof createSourceWatchStageAccumulator>,
): Promise<{ discoveredCount: number; skippedCount: number }> {
  const stats = {
    discoveredCount: 0,
    skippedCount: 0,
  };

  await walkMountedDirectory(rule, root, root, accumulator, stats);

  return stats;
}

async function stageDiscoveredSource(
  accumulator: ReturnType<typeof createSourceWatchStageAccumulator>,
  stats: { discoveredCount: number; skippedCount: number },
  source: SourceWatchDiscoveredSource,
): Promise<void> {
  stats.discoveredCount += 1;
  await accumulator.add(toSourceWatchStageItem("discovered", source));
}

async function stageSkippedSource(
  accumulator: ReturnType<typeof createSourceWatchStageAccumulator>,
  stats: { discoveredCount: number; skippedCount: number },
  source: SourceWatchSkippedSource,
): Promise<void> {
  stats.skippedCount += 1;
  await accumulator.add(toSourceWatchSkippedStageItem("skipped", source));
}

async function walkMountedDirectory(
  rule: SourceWatchRuleRecord,
  root: string,
  currentDirectory: string,
  accumulator: ReturnType<typeof createSourceWatchStageAccumulator>,
  stats: { discoveredCount: number; skippedCount: number },
): Promise<void> {
  const directory = await opendir(currentDirectory);

  for await (const entry of directory) {
    const absolutePath = resolve(currentDirectory, entry.name);
    const relativePath = normalizeSourcePath(relative(root, absolutePath));

    if (entry.isDirectory()) {
      if (isExcludedDirectory(relativePath, rule.excludeDirs)) {
        await stageSkippedSource(accumulator, stats, {
          source_path: relativePath,
          reason: "excluded_directory",
        });
        continue;
      }

      await walkMountedDirectory(rule, root, absolutePath, accumulator, stats);
      continue;
    }

    if (!entry.isFile()) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "unsupported_file_type",
      });
      continue;
    }

    if (matchesAnyGlob(relativePath, rule.excludeGlobs)) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "excluded_by_glob",
      });
      continue;
    }

    if (!isIncludedExtension(relativePath, rule.includeExtensions)) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "extension_not_included",
      });
      continue;
    }

    const fileStatus = await lstat(absolutePath);
    const maxFileSizeBytes =
      rule.maxFileSizeMb === null ? Number.POSITIVE_INFINITY : rule.maxFileSizeMb * 1024 * 1024;

    if (fileStatus.size > maxFileSizeBytes) {
      await stageSkippedSource(accumulator, stats, {
        source_path: relativePath,
        reason: "file_too_large",
        metadata: {
          max_file_size_mb: rule.maxFileSizeMb,
          size: fileStatus.size,
        },
      });
      continue;
    }

    const content = await readFile(absolutePath);
    const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;

    await stageDiscoveredSource(accumulator, stats, {
      name: basename(relativePath),
      source_path: relativePath,
      content_hash: contentHash,
      size: content.byteLength,
      metadata: {
        source_watch_rule_id: rule.id,
        source_watch_source_kind: rule.sourceKind,
        source_watch_location: rule.location,
      },
      ingest: {
        kind: "file",
        file_path: absolutePath,
        mime_type: inferMimeType(relativePath),
      },
    });
  }
}

async function hasMatchingSourceWatchFingerprint(
  rule: SourceWatchRuleRecord,
  existingDocumentProvider: SourceWatchExistingDocumentProvider | undefined,
  sourcePath: string,
  fingerprint: string,
): Promise<boolean> {
  const matched = await existingDocumentProvider?.hasMatchingFingerprint(
    rule,
    sourcePath,
    fingerprint,
  );

  return matched === true;
}

function createS3ObjectFingerprint(input: {
  bucket: string;
  etag?: string | undefined;
  key: string;
  lastModified?: string | undefined;
  rule: SourceWatchRuleRecord;
  size: number;
}): string {
  const payload = JSON.stringify({
    adapter: "s3_prefix",
    bucket: input.bucket,
    etag: input.etag ?? null,
    key: input.key,
    last_modified: input.lastModified ?? null,
    rule_id: input.rule.id,
    size: input.size,
  });

  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

function isExcludedDirectory(relativePath: string, excludeDirs: readonly string[]): boolean {
  if (excludeDirs.length === 0) {
    return false;
  }

  const segments = relativePath.split("/");

  return excludeDirs.some((excludeDir) => {
    const normalized = normalizeSourcePath(excludeDir);

    return (
      segments.includes(normalized) ||
      relativePath === normalized ||
      relativePath.startsWith(`${normalized}/`)
    );
  });
}

function isIncludedExtension(relativePath: string, includeExtensions: readonly string[]): boolean {
  if (includeExtensions.length === 0) {
    return true;
  }

  const extension = extname(relativePath).toLowerCase();

  return includeExtensions.map(normalizeExtension).includes(extension);
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();

  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function matchesAnyGlob(relativePath: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(relativePath));
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizeSourcePath(glob.trim());
  let pattern = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const nextCharacter = normalized[index + 1];

    if (character === "*" && nextCharacter === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }

    if (character === "*") {
      pattern += "[^/]*";
      continue;
    }

    if (character === "?") {
      pattern += "[^/]";
      continue;
    }

    pattern += escapeRegExp(character ?? "");
  }

  return new RegExp(`^${pattern}$`, "u");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function inferMimeType(sourcePath: string): string {
  const extension = extname(sourcePath).toLowerCase();
  const values: Record<string, string> = {
    ".csv": "text/csv",
    ".htm": "text/html",
    ".html": "text/html",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".rtf": "application/rtf",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  return values[extension] ?? "application/octet-stream";
}

function createUrlSourceName(url: URL): string {
  const pathName = url.pathname.replace(/\/+$/u, "");
  const lastSegment = pathName.split("/").filter(Boolean).pop();

  return lastSegment === undefined ? url.hostname : lastSegment;
}

function parseS3Location(
  value: string,
  fallbackBucket: string | undefined,
): { bucket: string; prefix: string } | null {
  const trimmed = value.trim();

  if (trimmed.startsWith("s3://")) {
    const withoutScheme = trimmed.slice("s3://".length);
    const separatorIndex = withoutScheme.indexOf("/");
    const bucket = separatorIndex === -1 ? withoutScheme : withoutScheme.slice(0, separatorIndex);
    const prefix = separatorIndex === -1 ? "" : withoutScheme.slice(separatorIndex + 1);

    return bucket.length === 0 ? null : { bucket, prefix };
  }

  if (fallbackBucket === undefined || fallbackBucket.length === 0) {
    return null;
  }

  return {
    bucket: fallbackBucket,
    prefix: normalizeSourcePath(trimmed),
  };
}

async function readS3Object(
  client: SourceWatchS3Client,
  bucket: string,
  key: string,
  maxBytes: number,
  config: RuntimeConfig,
  operationRecorder: ObjectStorageOperationRecorder,
  contentLength: number | undefined,
): Promise<Buffer> {
  const result = (await recordObjectStorageOperation({
    caller: "source_watch.s3_prefix",
    contentLength,
    enabled: config.limits.objectStorageOperations.metricsEnabled,
    operation: "GetObject",
    recorder: operationRecorder,
    run: () =>
      client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      ),
    scope: "source_watch",
  })) as SourceWatchGetObjectOutput;
  const body = result.Body;

  if (body === undefined) {
    return Buffer.alloc(0);
  }

  const bodyWithByteArray = body as { transformToByteArray?: () => Promise<Uint8Array> };

  if (typeof bodyWithByteArray.transformToByteArray === "function") {
    const bytes = Buffer.from(await bodyWithByteArray.transformToByteArray());

    return bytes.subarray(0, maxBytes);
  }

  throw new Error("S3 response body is not readable.");
}

async function writeTemporaryIngestFile(
  sourcePath: string,
  content: Buffer,
): Promise<{ cleanupPath: string; filePath: string }> {
  const tempRoot = await mkdtemp(join(tmpdir(), "fococontext-source-watch-ingest-"));
  const filePath = resolveSafeTemporaryIngestPath(tempRoot, sourcePath);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);

  return {
    cleanupPath: tempRoot,
    filePath,
  };
}

async function stageSourceWatchItems(
  options: SourceWatchScannerOptions,
  runtimeOptions: SourceWatchScannerRuntimeOptions | undefined,
  rule: SourceWatchRuleRecord,
  items: readonly SourceWatchScanStageItem[],
): Promise<void> {
  if (items.length === 0 || runtimeOptions?.scanRunId === undefined) {
    return;
  }

  await options.stageScanItems?.({
    items,
    rule,
    scanRunId: runtimeOptions.scanRunId,
  });
}

function createSourceWatchStageAccumulator(
  options: SourceWatchScannerOptions,
  runtimeOptions: SourceWatchScannerRuntimeOptions | undefined,
  rule: SourceWatchRuleRecord,
): {
  add: (item: SourceWatchScanStageItem) => Promise<void>;
  addMany: (items: readonly SourceWatchScanStageItem[]) => Promise<void>;
  flush: () => Promise<void>;
} {
  const windowSize = Math.max(1, Math.floor(options.comparisonWindowSize ?? 100));
  const pending: SourceWatchScanStageItem[] = [];
  const flush = async () => {
    if (pending.length === 0) {
      return;
    }

    const items = pending.splice(0, pending.length);

    await stageSourceWatchItems(options, runtimeOptions, rule, items);
  };
  const add = async (item: SourceWatchScanStageItem) => {
    pending.push(item);

    if (pending.length >= windowSize) {
      await flush();
    }
  };

  return {
    add,
    async addMany(items) {
      for (const item of items) {
        await add(item);
      }
    },
    flush,
  };
}

function toSourceWatchStageItem(
  itemKind: Extract<SourceWatchScanItemKind, "discovered" | "new" | "changed" | "unchanged">,
  source: SourceWatchDiscoveredSource,
): SourceWatchScanStageItem {
  return {
    comparison_status: itemKind,
    item_kind: itemKind,
    payload: { ...source },
    source_identity: createSourceWatchSourceIdentity(source),
    ...(source.content_hash === undefined ? {} : { content_hash: source.content_hash }),
    ...(source.source_path === undefined ? {} : { source_path: source.source_path }),
    ...(source.source_url === undefined ? {} : { source_url: source.source_url }),
  };
}

function toSourceWatchStageItems(
  itemKind: Extract<SourceWatchScanItemKind, "discovered" | "new" | "changed" | "unchanged">,
  sources: readonly SourceWatchDiscoveredSource[],
): SourceWatchScanStageItem[] {
  return sources.map((source) => toSourceWatchStageItem(itemKind, source));
}

function toSourceWatchSkippedStageItems(
  skipped: readonly SourceWatchSkippedSource[],
): SourceWatchScanStageItem[] {
  return skipped.map((source) => toSourceWatchSkippedStageItem("skipped", source));
}

function toSourceWatchSkippedStageItem(
  itemKind: Extract<SourceWatchScanItemKind, "skipped" | "failed">,
  source: SourceWatchSkippedSource,
): SourceWatchScanStageItem {
  return {
    comparison_status: itemKind,
    item_kind: itemKind,
    payload: { ...source },
    safe_error:
      itemKind === "failed"
        ? {
            reason: source.reason,
            ...(source.metadata === undefined ? {} : { metadata: source.metadata }),
          }
        : null,
    source_identity: source.source_path ?? source.reason,
    ...(source.source_path === undefined ? {} : { source_path: source.source_path }),
  };
}

function createSourceWatchSourceIdentity(source: SourceWatchDiscoveredSource): string {
  return source.source_path ?? source.source_url ?? source.name;
}

function normalizeSourcePath(value: string): string {
  return value.split(sep).join("/").replace(/^\/+/u, "");
}

export function resolveSafeTemporaryIngestPath(tempRoot: string, sourcePath: string): string {
  if (isAbsolute(sourcePath) || /^[a-z]:[\\/]/iu.test(sourcePath)) {
    throw new Error("Source watch source path must be relative.");
  }

  const normalizedPath = normalizeSourcePath(sourcePath).trim();

  if (normalizedPath.length === 0) {
    throw new Error("Source watch source path is required.");
  }

  const root = resolve(tempRoot);
  const target = resolve(root, normalizedPath);

  if (target !== root && target.startsWith(`${root}${sep}`)) {
    return target;
  }

  throw new Error("Source watch source path escapes the temporary ingest directory.");
}

function readOptionalCursorString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function createFailedDiscovery(sourcePath: string, reason: string): SourceWatchScanDiscovery {
  return {
    status: "failed",
    newSources: [],
    changedSources: [],
    deleteCandidates: [],
    skipped: [
      {
        source_path: sourcePath,
        reason,
      },
    ],
    execution: {
      enabled: true,
    },
  };
}

function createDisabledDiscovery(
  reason: SourceWatchScanDiscovery["execution"]["reason"] = "source_watch_execution_not_configured",
): SourceWatchScanDiscovery {
  return {
    status: "disabled",
    newSources: [],
    changedSources: [],
    deleteCandidates: [],
    skipped: [],
    execution: {
      enabled: false,
      reason,
    },
  };
}
