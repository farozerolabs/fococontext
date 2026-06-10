import { ApiError } from "@fococontext/contracts";
import { loadReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";
import type { SourceWatchRuntimeAdapters } from "./source-watch-config.js";
import { parseUploadLimits, type RuntimeConfigUploadLimits } from "./upload-config.js";
import {
  computeCompilePromptLimits,
  maskSecret,
  parseCorsOrigins,
  type CompilePromptLimits,
} from "./runtime-config-helpers.js";

export { computeCompilePromptLimits, maskSecret } from "./runtime-config-helpers.js";
export type { CompilePromptLimits } from "./runtime-config-helpers.js";
export type {
  SourceWatchRuntimeAdapterBase,
  SourceWatchRuntimeAdapters,
} from "./source-watch-config.js";
export type { RuntimeConfigUploadLimits, UploadMultipartFallbackMode } from "./upload-config.js";

export type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export interface RuntimeConfig {
  api: {
    port: number;
    publicBaseUrl?: string;
  };
  admin: {
    port: number;
    publicBaseUrl?: string;
    username: string;
    password: string;
  };
  auth: {
    apiKey: string;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  storage: {
    providerName: string;
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    publicBaseUrl?: string;
  };
  models: {
    chat: {
      providerName: string;
      baseUrl: string;
      apiKey: string;
      defaultModel: string;
      analysisModel: string;
      generationModel: string;
      mergeModel: string;
      requestMaxRetries: number;
    };
    embedding: {
      providerName: string;
      baseUrl: string;
      apiKey: string;
      model: string;
      dimensions: number;
    };
    rerank?: {
      providerName: string;
      baseUrl: string;
      apiKey: string;
      model: string;
    };
    visionCaption?: {
      providerName: string;
      baseUrl: string;
      apiKey: string;
      model: string;
      requestMaxRetries: number;
    };
  };
  limits: RuntimeConfigLimits;
  cors: {
    origins: string[];
  };
  webhook: {
    secretConfigured: boolean;
    maskedSecret: string;
    delivery: WebhookDeliveryRuntimeConfig;
  };
  sourceWatch: {
    adapters: SourceWatchRuntimeAdapters;
    containerDir: string;
    hostDir?: string;
    scheduler: {
      enabled: boolean;
      defaultIntervalSeconds: number;
      maxRetries: number;
      retryBaseDelayMs: number;
    };
  };
  ocr: {
    enabled: boolean;
    provider: string;
    serviceBaseUrl?: string;
    serviceApiKey?: string;
    languages: string[];
  };
  release: ReleaseMetadata;
}

export interface RuntimeConfigLimits {
  upload: RuntimeConfigUploadLimits;
  objectStorageOperations: ObjectStorageOperationLimits;
  parser: {
    maxFileSizeMb: number;
    timeoutSeconds: number;
    concurrency: number;
    maxZipEntries: number;
    maxZipExpandedMb: number;
    maxZipEntryMb: number;
    mediaUploadConcurrency: number;
    maxImagesPerDocument: number;
    maxRenderedSnapshotsPerDocument: number;
    maxImagePixels: number;
    maxImageBytes: number;
    minImageWidth: number;
    minImageHeight: number;
    visualExtractionConcurrency: number;
    remoteImageFetchingEnabled: boolean;
    pdfSnapshotMinTextChars: number;
  };
  queue: {
    concurrency: number;
    sourceParseConcurrency: number;
    wikiAnalyzeConcurrency: number;
    wikiGenerateConcurrency: number;
    wikiMergeConcurrency: number;
  };
  apiFanOut: {
    batchImportConcurrency: number;
    sourceWatchConcurrency: number;
  };
  deletionCleanup: DeletionCleanupLimits;
  compile: CompilePromptLimits;
  retrieve: {
    defaultTopK: number;
    maxTopK: number;
    defaultGraphDepth: number;
    maxGraphDepth: number;
    defaultGraphLimitPerResult: number;
    maxGraphLimitPerResult: number;
    defaultContextBudgetTokens: number;
    maxContextBudgetTokens: number;
  };
  sourceEvidence: RuntimeSourceEvidenceLimits;
  visionCaption: {
    concurrency: number;
    imageConcurrency: number;
    contextChars: number;
    maxImagesPerDocument: number;
    maxOutputTokens: number;
    retryBaseDelayMs: number;
    timeoutSeconds: number;
  };
  ocr: {
    pageDpi: number;
    maxPagesPerDocument: number;
    maxPagePixels: number;
    concurrency: number;
    pageConcurrency: number;
    timeoutSeconds: number;
    maxRetries: number;
    retryBaseDelayMs: number;
    minTextCharsPerPage: number;
    confidenceThreshold: number;
    storePageImages: boolean;
  };
  webhookDelivery: WebhookDeliveryLimits;
  effectiveConcurrency: RuntimeConfigEffectiveConcurrency;
  pressure: RuntimePressureLimits;
}

export interface ObjectStorageOperationLimits {
  metricsEnabled: boolean;
  pressureWarningsEnabled: boolean;
  metricsWindowSeconds: number;
  classAWarningThreshold: number;
  classBWarningThreshold: number;
  previewCacheEnabled: boolean;
  previewMaxChars: number;
  sourceWatchIncrementalScanEnabled: boolean;
  multipartPartSizeBytes: number;
}

export interface RuntimeSourceEvidenceLimits {
  defaultMaxChars: number;
  maxMaxChars: number;
  defaultContextChars: number;
  maxContextChars: number;
  batchMaxItems: number;
  batchTotalOutputMaxChars: number;
}

export interface RuntimePressureLimits {
  uploadDegradedThreshold: number;
  queueDepthDegradedThreshold: number;
  queueDepthSaturatedThreshold: number;
  compileQueueDepthDegradedThreshold: number;
  compileQueueDepthSaturatedThreshold: number;
  providerFailureDegradedThreshold: number;
  expensiveValidationEnabled: boolean;
}

export interface RuntimeConfigEffectiveConcurrency {
  fallbackConcurrency: number;
  api: {
    uploadMaxConcurrentFiles: number;
    batchImportConcurrency: number;
    sourceWatchConcurrency: number;
  };
  workers: {
    sourceParseConcurrency: number;
    sourceOcrConcurrency: number;
    mediaCaptionConcurrency: number;
    wikiAnalyzeConcurrency: number;
    wikiGenerateConcurrency: number;
    wikiMergeConcurrency: number;
    webhookDispatchConcurrency: number;
    deletionCleanupConcurrency: number;
  };
  internal: {
    ocrPageConcurrency: number;
    visionCaptionImageConcurrency: number;
  };
}

export type DeletionCleanupRetryBackoff = "fixed" | "exponential";
export type WebhookDeliveryRetryBackoff = "fixed" | "exponential";
export interface WebhookDeliveryRuntimeConfig {
  enabled: boolean;
}

export interface WebhookDeliveryLimits {
  timeoutSeconds: number;
  concurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryBackoff: WebhookDeliveryRetryBackoff;
  signingToleranceSeconds: number;
  retentionDays: number;
}

export interface DeletionCleanupLimits {
  concurrency: number;
  objectBatchSize: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryBackoff: DeletionCleanupRetryBackoff;
  operationRetentionDays: number | null;
  itemRetentionDays: number;
}

const requiredEnvKeys = [
  "FOCOCONTEXT_API_PORT",
  "FOCOCONTEXT_ADMIN_PORT",
  "FOCOCONTEXT_ADMIN_USERNAME",
  "FOCOCONTEXT_ADMIN_PASSWORD",
  "FOCOCONTEXT_API_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "S3_PROVIDER_NAME",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "CHAT_PROVIDER_NAME",
  "CHAT_BASE_URL",
  "CHAT_API_KEY",
  "CHAT_DEFAULT_MODEL",
  "CHAT_ANALYSIS_MODEL",
  "CHAT_GENERATION_MODEL",
  "CHAT_MERGE_MODEL",
  "EMBEDDING_PROVIDER_NAME",
  "EMBEDDING_BASE_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS",
  "UPLOAD_MAX_FILE_SIZE_MB",
  "UPLOAD_MAX_CONCURRENT_FILES",
  "PARSER_MAX_FILE_SIZE_MB",
  "PARSER_TIMEOUT_SECONDS",
  "PARSER_CONCURRENCY",
  "PARSER_MAX_IMAGES_PER_DOCUMENT",
  "PARSER_MIN_IMAGE_WIDTH",
  "PARSER_MIN_IMAGE_HEIGHT",
  "FOCOCONTEXT_QUEUE_CONCURRENCY",
  "COMPILE_MAX_CONTEXT_CHARS",
  "FOCOCONTEXT_CORS_ORIGINS",
  "RETRIEVE_DEFAULT_GRAPH_DEPTH",
  "RETRIEVE_MAX_GRAPH_DEPTH",
  "RETRIEVE_DEFAULT_CONTEXT_BUDGET_TOKENS",
  "RETRIEVE_MAX_CONTEXT_BUDGET_TOKENS",
] as const;

const optionalRerankKeys = [
  "RERANK_PROVIDER_NAME",
  "RERANK_BASE_URL",
  "RERANK_API_KEY",
  "RERANK_MODEL",
] as const;

const optionalVisionCaptionProviderKeys = [
  "VISION_CAPTION_PROVIDER_NAME",
  "VISION_CAPTION_BASE_URL",
  "VISION_CAPTION_API_KEY",
  "VISION_CAPTION_MODEL",
] as const;

const defaultObjectStorageMetricsWindowSeconds = 300;
const defaultObjectStorageClassAWarningThreshold = 1000;
const defaultObjectStorageClassBWarningThreshold = 10_000;
const defaultObjectStoragePreviewMaxChars = 200_000;
const defaultS3MultipartPartSizeBytes = 16 * 1024 * 1024;
const minimumS3MultipartPartSizeBytes = 5 * 1024 * 1024;
const maximumS3MultipartPartSizeBytes = 5 * 1024 * 1024 * 1024;
const defaultSourceEvidenceMaxChars = 4000;
const maxSourceEvidenceMaxChars = 12000;
const defaultSourceEvidenceContextChars = 800;
const maxSourceEvidenceContextChars = 2000;
const defaultSourceEvidenceBatchMaxItems = 20;
const defaultSourceEvidenceBatchTotalOutputMaxChars = 40000;

function readRequired(env: RuntimeEnv, key: (typeof requiredEnvKeys)[number]): string {
  return env[key]?.trim() ?? "";
}

function readOptional(env: RuntimeEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === "" ? undefined : value;
}

function normalizeOptionalBaseUrl(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/u, "");
}

function parsePositiveInteger(env: RuntimeEnv, key: string, invalid: string[]): number {
  const value = readOptional(env, key);
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    invalid.push(key);
    return 0;
  }

  return parsed;
}

function parseNonNegativeInteger(env: RuntimeEnv, key: string, invalid: string[]): number {
  const value = readOptional(env, key);
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    invalid.push(key);
    return 0;
  }

  return parsed;
}

function parseOptionalNonNegativeInteger(
  env: RuntimeEnv,
  key: string,
  defaultValue: number,
  invalid: string[],
): number {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    invalid.push(key);
    return 0;
  }

  return parsed;
}

function parseOptionalPositiveInteger(
  env: RuntimeEnv,
  key: string,
  defaultValue: number,
  invalid: string[],
): number {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    invalid.push(key);
    return 0;
  }

  return parsed;
}

function parseOptionalPositiveIntegerInRange(
  env: RuntimeEnv,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
  invalid: string[],
): number {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    invalid.push(key);
    return defaultValue;
  }

  return parsed;
}

function parseOptionalPositiveIntegerOrNull(
  env: RuntimeEnv,
  key: string,
  invalid: string[],
): number | null {
  const value = readOptional(env, key);

  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    invalid.push(key);
    return null;
  }

  return parsed;
}

function parseOptionalNumberInRange(
  env: RuntimeEnv,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
  invalid: string[],
): number {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    invalid.push(key);
    return defaultValue;
  }

  return parsed;
}

function parseOptionalStringList(env: RuntimeEnv, key: string, defaultValue: string[]): string[] {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length === 0 ? defaultValue : parsed;
}

function parseOptionalDeletionCleanupRetryBackoff(
  env: RuntimeEnv,
  key: string,
  defaultValue: DeletionCleanupRetryBackoff,
  invalid: string[],
): DeletionCleanupRetryBackoff {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (value === "fixed" || value === "exponential") {
    return value;
  }

  invalid.push(key);
  return defaultValue;
}

function parseOptionalWebhookDeliveryRetryBackoff(
  env: RuntimeEnv,
  key: string,
  defaultValue: WebhookDeliveryRetryBackoff,
  invalid: string[],
): WebhookDeliveryRetryBackoff {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (value === "fixed" || value === "exponential") {
    return value;
  }

  invalid.push(key);
  return defaultValue;
}

function parseBoolean(env: RuntimeEnv, key: string, invalid: string[]): boolean {
  const value = readOptional(env, key);

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  invalid.push(key);
  return false;
}

function parseOptionalBoolean(
  env: RuntimeEnv,
  key: string,
  defaultValue: boolean,
  invalid: string[],
): boolean {
  const value = readOptional(env, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  invalid.push(key);
  return defaultValue;
}

export function loadRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
  const missing: string[] = requiredEnvKeys.filter((key) => readRequired(env, key) === "");
  const invalid: string[] = [];
  const rerankValues = optionalRerankKeys.map((key) => readOptional(env, key));
  const hasRerankConfig = rerankValues.some((value) => value !== undefined);
  const visionCaptionEnabled = parseOptionalBoolean(env, "VISION_CAPTION_ENABLED", false, invalid);
  const visionCaptionValues = optionalVisionCaptionProviderKeys.map((key) =>
    readOptional(env, key),
  );
  const hasVisionCaptionConfig = visionCaptionValues.some((value) => value !== undefined);
  const ocrEnabled = parseOptionalBoolean(env, "OCR_ENABLED", false, invalid);
  const ocrProvider = readOptional(env, "OCR_PROVIDER") ?? "rapidocr";
  const ocrServiceBaseUrl = readOptional(env, "OCR_SERVICE_BASE_URL");
  const ocrServiceApiKey = readOptional(env, "OCR_SERVICE_API_KEY");
  const ocrLanguages = parseOptionalStringList(env, "OCR_LANGS", ["ch", "en"]);
  const s3PublicBaseUrl = readOptional(env, "S3_PUBLIC_BASE_URL");
  const publicApiBaseUrl = normalizeOptionalBaseUrl(
    readOptional(env, "FOCOCONTEXT_ADMIN_API_BASE_URL"),
  );
  const publicAdminBaseUrl = normalizeOptionalBaseUrl(
    readOptional(env, "FOCOCONTEXT_ADMIN_BASE_URL"),
  );
  const sourceWatchHostDir = readOptional(env, "FOCOCONTEXT_SOURCE_WATCH_HOST_DIR");
  const sourceWatchContainerDir =
    readOptional(env, "FOCOCONTEXT_SOURCE_WATCH_CONTAINER_DIR") ?? "/source-watch";
  const sourceWatchS3AccessKeyId = readOptional(env, "SOURCE_WATCH_S3_ACCESS_KEY_ID");
  const sourceWatchS3Bucket = readOptional(env, "SOURCE_WATCH_S3_BUCKET");
  const sourceWatchS3Endpoint = readOptional(env, "SOURCE_WATCH_S3_ENDPOINT");
  const sourceWatchS3Region = readOptional(env, "SOURCE_WATCH_S3_REGION");
  const sourceWatchS3SecretAccessKey = readOptional(env, "SOURCE_WATCH_S3_SECRET_ACCESS_KEY");
  const uploadLimits = parseUploadLimits(env, invalid);
  const parserMaxFileSizeMb = parsePositiveInteger(env, "PARSER_MAX_FILE_SIZE_MB", invalid);
  const parserConcurrency = parsePositiveInteger(env, "PARSER_CONCURRENCY", invalid);
  const queueConcurrency = parsePositiveInteger(env, "FOCOCONTEXT_QUEUE_CONCURRENCY", invalid);
  const sourceParseConcurrency = parseOptionalPositiveInteger(
    env,
    "SOURCE_PARSE_CONCURRENCY",
    parserConcurrency,
    invalid,
  );
  const wikiAnalyzeConcurrency = parseOptionalPositiveInteger(
    env,
    "WIKI_ANALYZE_CONCURRENCY",
    queueConcurrency,
    invalid,
  );
  const wikiGenerateConcurrency = parseOptionalPositiveInteger(
    env,
    "WIKI_GENERATE_CONCURRENCY",
    queueConcurrency,
    invalid,
  );
  const wikiMergeConcurrency = parseOptionalPositiveInteger(
    env,
    "WIKI_MERGE_CONCURRENCY",
    queueConcurrency,
    invalid,
  );
  const batchImportConcurrency = parseOptionalPositiveInteger(
    env,
    "BATCH_IMPORT_CONCURRENCY",
    queueConcurrency,
    invalid,
  );
  const sourceWatchConcurrency = parseOptionalPositiveInteger(
    env,
    "SOURCE_WATCH_SCAN_CONCURRENCY",
    queueConcurrency,
    invalid,
  );
  const sourceWatchUrlListConcurrency = parseOptionalPositiveInteger(
    env,
    "SOURCE_WATCH_URL_LIST_CONCURRENCY",
    sourceWatchConcurrency,
    invalid,
  );
  const sourceWatchS3Concurrency = parseOptionalPositiveInteger(
    env,
    "SOURCE_WATCH_S3_CONCURRENCY",
    sourceWatchConcurrency,
    invalid,
  );
  const sourceWatchGitConcurrency = parseOptionalPositiveInteger(
    env,
    "SOURCE_WATCH_GIT_CONCURRENCY",
    sourceWatchConcurrency,
    invalid,
  );
  const sourceWatchScanIntervalSeconds = parseOptionalPositiveInteger(
    env,
    "SOURCE_WATCH_SCAN_INTERVAL_SECONDS",
    3600,
    invalid,
  );
  const sourceWatchScanMaxRetries = parseOptionalNonNegativeInteger(
    env,
    "SOURCE_WATCH_SCAN_MAX_RETRIES",
    2,
    invalid,
  );
  const sourceWatchScanRetryBaseDelayMs = parseOptionalNonNegativeInteger(
    env,
    "SOURCE_WATCH_SCAN_RETRY_BASE_DELAY_MS",
    1000,
    invalid,
  );
  const ocrConcurrency = parseOptionalPositiveInteger(env, "OCR_CONCURRENCY", 1, invalid);
  const ocrPageConcurrency = parseOptionalPositiveInteger(
    env,
    "OCR_PAGE_CONCURRENCY",
    ocrConcurrency,
    invalid,
  );
  const visionCaptionConcurrency = parseOptionalPositiveInteger(
    env,
    "VISION_CAPTION_CONCURRENCY",
    1,
    invalid,
  );
  const visionCaptionImageConcurrency = parseOptionalPositiveInteger(
    env,
    "VISION_CAPTION_IMAGE_CONCURRENCY",
    visionCaptionConcurrency,
    invalid,
  );
  const deletionCleanupConcurrency = parseOptionalPositiveInteger(
    env,
    "DELETION_CLEANUP_CONCURRENCY",
    1,
    invalid,
  );
  const webhookDeliveryConcurrency = parseOptionalPositiveInteger(
    env,
    "WEBHOOK_DELIVERY_CONCURRENCY",
    queueConcurrency,
    invalid,
  );
  const objectStorageOperations: ObjectStorageOperationLimits = {
    metricsEnabled: parseOptionalBoolean(env, "S3_OPERATION_METRICS_ENABLED", true, invalid),
    pressureWarningsEnabled: parseOptionalBoolean(
      env,
      "S3_OPERATION_PRESSURE_WARNINGS_ENABLED",
      true,
      invalid,
    ),
    metricsWindowSeconds: parseOptionalPositiveInteger(
      env,
      "S3_OPERATION_METRICS_WINDOW_SECONDS",
      defaultObjectStorageMetricsWindowSeconds,
      invalid,
    ),
    classAWarningThreshold: parseOptionalNonNegativeInteger(
      env,
      "S3_OPERATION_CLASS_A_WARNING_THRESHOLD",
      defaultObjectStorageClassAWarningThreshold,
      invalid,
    ),
    classBWarningThreshold: parseOptionalNonNegativeInteger(
      env,
      "S3_OPERATION_CLASS_B_WARNING_THRESHOLD",
      defaultObjectStorageClassBWarningThreshold,
      invalid,
    ),
    previewCacheEnabled: parseOptionalBoolean(env, "S3_PREVIEW_CACHE_ENABLED", true, invalid),
    previewMaxChars: parseOptionalPositiveInteger(
      env,
      "S3_PREVIEW_MAX_CHARS",
      defaultObjectStoragePreviewMaxChars,
      invalid,
    ),
    sourceWatchIncrementalScanEnabled: parseOptionalBoolean(
      env,
      "SOURCE_WATCH_S3_INCREMENTAL_SCAN_ENABLED",
      true,
      invalid,
    ),
    multipartPartSizeBytes: parseOptionalPositiveIntegerInRange(
      env,
      "S3_MULTIPART_PART_SIZE_BYTES",
      defaultS3MultipartPartSizeBytes,
      minimumS3MultipartPartSizeBytes,
      maximumS3MultipartPartSizeBytes,
      invalid,
    ),
  };
  if (visionCaptionEnabled) {
    optionalVisionCaptionProviderKeys.forEach((key, index) => {
      if (visionCaptionValues[index] === undefined) {
        missing.push(key);
      }
    });
  }

  if (ocrEnabled && ocrServiceBaseUrl === undefined) {
    missing.push("OCR_SERVICE_BASE_URL");
  }

  if (missing.length > 0) {
    throw new ApiError("invalid_request", {
      message: "Missing runtime configuration.",
      details: {
        missing,
      },
    });
  }

  if (hasRerankConfig) {
    optionalRerankKeys.forEach((key, index) => {
      if (rerankValues[index] === undefined) {
        invalid.push(key);
      }
    });
  }

  const config: RuntimeConfig = {
    api: {
      port: parsePositiveInteger(env, "FOCOCONTEXT_API_PORT", invalid),
      ...(publicApiBaseUrl === undefined ? {} : { publicBaseUrl: publicApiBaseUrl }),
    },
    admin: {
      port: parsePositiveInteger(env, "FOCOCONTEXT_ADMIN_PORT", invalid),
      ...(publicAdminBaseUrl === undefined ? {} : { publicBaseUrl: publicAdminBaseUrl }),
      username: readRequired(env, "FOCOCONTEXT_ADMIN_USERNAME"),
      password: readRequired(env, "FOCOCONTEXT_ADMIN_PASSWORD"),
    },
    auth: {
      apiKey: readRequired(env, "FOCOCONTEXT_API_KEY"),
    },
    database: {
      url: readRequired(env, "DATABASE_URL"),
    },
    redis: {
      url: readRequired(env, "REDIS_URL"),
    },
    storage: {
      providerName: readRequired(env, "S3_PROVIDER_NAME"),
      endpoint: readRequired(env, "S3_ENDPOINT"),
      region: readRequired(env, "S3_REGION"),
      bucket: readRequired(env, "S3_BUCKET"),
      accessKeyId: readRequired(env, "S3_ACCESS_KEY_ID"),
      secretAccessKey: readRequired(env, "S3_SECRET_ACCESS_KEY"),
      forcePathStyle: parseBoolean(env, "S3_FORCE_PATH_STYLE", invalid),
      ...(s3PublicBaseUrl === undefined ? {} : { publicBaseUrl: s3PublicBaseUrl }),
    },
    models: {
      chat: {
        providerName: readRequired(env, "CHAT_PROVIDER_NAME"),
        baseUrl: readRequired(env, "CHAT_BASE_URL"),
        apiKey: readRequired(env, "CHAT_API_KEY"),
        defaultModel: readRequired(env, "CHAT_DEFAULT_MODEL"),
        analysisModel: readRequired(env, "CHAT_ANALYSIS_MODEL"),
        generationModel: readRequired(env, "CHAT_GENERATION_MODEL"),
        mergeModel: readRequired(env, "CHAT_MERGE_MODEL"),
        requestMaxRetries: parseOptionalNonNegativeInteger(
          env,
          "CHAT_REQUEST_MAX_RETRIES",
          2,
          invalid,
        ),
      },
      embedding: {
        providerName: readRequired(env, "EMBEDDING_PROVIDER_NAME"),
        baseUrl: readRequired(env, "EMBEDDING_BASE_URL"),
        apiKey: readRequired(env, "EMBEDDING_API_KEY"),
        model: readRequired(env, "EMBEDDING_MODEL"),
        dimensions: parsePositiveInteger(env, "EMBEDDING_DIMENSIONS", invalid),
      },
    },
    limits: {
      upload: uploadLimits,
      objectStorageOperations,
      parser: {
        maxFileSizeMb: parserMaxFileSizeMb,
        timeoutSeconds: parsePositiveInteger(env, "PARSER_TIMEOUT_SECONDS", invalid),
        concurrency: parserConcurrency,
        maxZipEntries: parseOptionalPositiveInteger(env, "PARSER_ZIP_MAX_ENTRIES", 10_000, invalid),
        maxZipExpandedMb: parseOptionalPositiveInteger(
          env,
          "PARSER_ZIP_MAX_EXPANDED_MB",
          parserMaxFileSizeMb * 20,
          invalid,
        ),
        maxZipEntryMb: parseOptionalPositiveInteger(
          env,
          "PARSER_ZIP_MAX_ENTRY_MB",
          parserMaxFileSizeMb,
          invalid,
        ),
        mediaUploadConcurrency: parseOptionalPositiveInteger(
          env,
          "PARSER_MEDIA_UPLOAD_CONCURRENCY",
          parserConcurrency,
          invalid,
        ),
        maxImagesPerDocument: parsePositiveInteger(env, "PARSER_MAX_IMAGES_PER_DOCUMENT", invalid),
        maxRenderedSnapshotsPerDocument: parseOptionalNonNegativeInteger(
          env,
          "PARSER_MAX_RENDERED_SNAPSHOTS_PER_DOCUMENT",
          10,
          invalid,
        ),
        maxImagePixels: parseOptionalPositiveInteger(
          env,
          "PARSER_MAX_IMAGE_PIXELS",
          16_000_000,
          invalid,
        ),
        maxImageBytes: parseOptionalPositiveInteger(
          env,
          "PARSER_MAX_IMAGE_BYTES",
          10_485_760,
          invalid,
        ),
        minImageWidth: parsePositiveInteger(env, "PARSER_MIN_IMAGE_WIDTH", invalid),
        minImageHeight: parsePositiveInteger(env, "PARSER_MIN_IMAGE_HEIGHT", invalid),
        visualExtractionConcurrency: parseOptionalPositiveInteger(
          env,
          "PARSER_VISUAL_EXTRACTION_CONCURRENCY",
          2,
          invalid,
        ),
        remoteImageFetchingEnabled: parseOptionalBoolean(
          env,
          "PARSER_REMOTE_IMAGE_FETCHING_ENABLED",
          false,
          invalid,
        ),
        pdfSnapshotMinTextChars: parseOptionalPositiveInteger(
          env,
          "PARSER_PDF_SNAPSHOT_MIN_TEXT_CHARS",
          80,
          invalid,
        ),
      },
      queue: {
        concurrency: queueConcurrency,
        sourceParseConcurrency,
        wikiAnalyzeConcurrency,
        wikiGenerateConcurrency,
        wikiMergeConcurrency,
      },
      apiFanOut: {
        batchImportConcurrency,
        sourceWatchConcurrency,
      },
      deletionCleanup: {
        concurrency: deletionCleanupConcurrency,
        objectBatchSize: parseOptionalPositiveIntegerInRange(
          env,
          "DELETION_CLEANUP_OBJECT_BATCH_SIZE",
          100,
          1,
          1000,
          invalid,
        ),
        maxRetries: parseOptionalNonNegativeInteger(
          env,
          "DELETION_CLEANUP_MAX_RETRIES",
          3,
          invalid,
        ),
        retryBaseDelayMs: parseOptionalNonNegativeInteger(
          env,
          "DELETION_CLEANUP_RETRY_BASE_DELAY_MS",
          1000,
          invalid,
        ),
        retryBackoff: parseOptionalDeletionCleanupRetryBackoff(
          env,
          "DELETION_CLEANUP_RETRY_BACKOFF",
          "exponential",
          invalid,
        ),
        operationRetentionDays: parseOptionalPositiveIntegerOrNull(
          env,
          "DELETION_CLEANUP_OPERATION_RETENTION_DAYS",
          invalid,
        ),
        itemRetentionDays: parseOptionalPositiveInteger(
          env,
          "DELETION_CLEANUP_ITEM_RETENTION_DAYS",
          30,
          invalid,
        ),
      },
      compile: computeCompilePromptLimits(
        parsePositiveInteger(env, "COMPILE_MAX_CONTEXT_CHARS", invalid),
      ),
      retrieve: {
        defaultTopK: parseOptionalPositiveInteger(env, "RETRIEVE_DEFAULT_TOP_K", 10, invalid),
        maxTopK: parseOptionalPositiveInteger(env, "RETRIEVE_MAX_TOP_K", 20, invalid),
        defaultGraphDepth: parseNonNegativeInteger(env, "RETRIEVE_DEFAULT_GRAPH_DEPTH", invalid),
        maxGraphDepth: parsePositiveInteger(env, "RETRIEVE_MAX_GRAPH_DEPTH", invalid),
        defaultGraphLimitPerResult: parseOptionalPositiveInteger(
          env,
          "RETRIEVE_DEFAULT_GRAPH_LIMIT_PER_RESULT",
          5,
          invalid,
        ),
        maxGraphLimitPerResult: parseOptionalPositiveInteger(
          env,
          "RETRIEVE_MAX_GRAPH_LIMIT_PER_RESULT",
          10,
          invalid,
        ),
        defaultContextBudgetTokens: parsePositiveInteger(
          env,
          "RETRIEVE_DEFAULT_CONTEXT_BUDGET_TOKENS",
          invalid,
        ),
        maxContextBudgetTokens: parsePositiveInteger(
          env,
          "RETRIEVE_MAX_CONTEXT_BUDGET_TOKENS",
          invalid,
        ),
      },
      sourceEvidence: {
        defaultMaxChars: parseOptionalPositiveIntegerInRange(
          env,
          "SOURCE_EVIDENCE_DEFAULT_MAX_CHARS",
          defaultSourceEvidenceMaxChars,
          1,
          maxSourceEvidenceMaxChars,
          invalid,
        ),
        maxMaxChars: parseOptionalPositiveIntegerInRange(
          env,
          "SOURCE_EVIDENCE_MAX_CHARS",
          maxSourceEvidenceMaxChars,
          1,
          maxSourceEvidenceMaxChars,
          invalid,
        ),
        defaultContextChars: parseOptionalPositiveIntegerInRange(
          env,
          "SOURCE_EVIDENCE_DEFAULT_CONTEXT_CHARS",
          defaultSourceEvidenceContextChars,
          1,
          maxSourceEvidenceContextChars,
          invalid,
        ),
        maxContextChars: parseOptionalPositiveIntegerInRange(
          env,
          "SOURCE_EVIDENCE_MAX_CONTEXT_CHARS",
          maxSourceEvidenceContextChars,
          1,
          maxSourceEvidenceContextChars,
          invalid,
        ),
        batchMaxItems: parseOptionalPositiveIntegerInRange(
          env,
          "SOURCE_EVIDENCE_BATCH_MAX_ITEMS",
          defaultSourceEvidenceBatchMaxItems,
          1,
          defaultSourceEvidenceBatchMaxItems,
          invalid,
        ),
        batchTotalOutputMaxChars: parseOptionalPositiveInteger(
          env,
          "SOURCE_EVIDENCE_BATCH_TOTAL_OUTPUT_MAX_CHARS",
          defaultSourceEvidenceBatchTotalOutputMaxChars,
          invalid,
        ),
      },
      visionCaption: {
        concurrency: visionCaptionConcurrency,
        imageConcurrency: visionCaptionImageConcurrency,
        contextChars: parseOptionalPositiveInteger(
          env,
          "VISION_CAPTION_CONTEXT_CHARS",
          200,
          invalid,
        ),
        maxImagesPerDocument: parseOptionalPositiveInteger(
          env,
          "VISION_CAPTION_MAX_IMAGES_PER_DOCUMENT",
          100,
          invalid,
        ),
        maxOutputTokens: parseOptionalPositiveInteger(
          env,
          "VISION_CAPTION_MAX_OUTPUT_TOKENS",
          160,
          invalid,
        ),
        retryBaseDelayMs: parseOptionalNonNegativeInteger(
          env,
          "VISION_CAPTION_RETRY_BASE_DELAY_MS",
          500,
          invalid,
        ),
        timeoutSeconds: parseOptionalPositiveInteger(
          env,
          "VISION_CAPTION_TIMEOUT_SECONDS",
          60,
          invalid,
        ),
      },
      ocr: {
        pageDpi: parseOptionalPositiveInteger(env, "OCR_PAGE_DPI", 180, invalid),
        maxPagesPerDocument: parseOptionalPositiveInteger(
          env,
          "OCR_MAX_PAGES_PER_DOCUMENT",
          200,
          invalid,
        ),
        maxPagePixels: parseOptionalPositiveInteger(
          env,
          "OCR_MAX_PAGE_PIXELS",
          20_000_000,
          invalid,
        ),
        concurrency: ocrConcurrency,
        pageConcurrency: ocrPageConcurrency,
        timeoutSeconds: parseOptionalPositiveInteger(env, "OCR_TIMEOUT_SECONDS", 60, invalid),
        maxRetries: parseOptionalNonNegativeInteger(env, "OCR_MAX_RETRIES", 2, invalid),
        retryBaseDelayMs: parseOptionalNonNegativeInteger(
          env,
          "OCR_RETRY_BASE_DELAY_MS",
          500,
          invalid,
        ),
        minTextCharsPerPage: parseOptionalPositiveInteger(
          env,
          "OCR_MIN_TEXT_CHARS_PER_PAGE",
          80,
          invalid,
        ),
        confidenceThreshold: parseOptionalNumberInRange(
          env,
          "OCR_CONFIDENCE_THRESHOLD",
          0.5,
          0,
          1,
          invalid,
        ),
        storePageImages: parseOptionalBoolean(env, "OCR_STORE_PAGE_IMAGES", false, invalid),
      },
      webhookDelivery: {
        timeoutSeconds: parseOptionalPositiveInteger(
          env,
          "WEBHOOK_DELIVERY_TIMEOUT_SECONDS",
          10,
          invalid,
        ),
        concurrency: webhookDeliveryConcurrency,
        maxRetries: parseOptionalNonNegativeInteger(
          env,
          "WEBHOOK_DELIVERY_MAX_RETRIES",
          3,
          invalid,
        ),
        retryBaseDelayMs: parseOptionalNonNegativeInteger(
          env,
          "WEBHOOK_DELIVERY_RETRY_BASE_DELAY_MS",
          1000,
          invalid,
        ),
        retryBackoff: parseOptionalWebhookDeliveryRetryBackoff(
          env,
          "WEBHOOK_DELIVERY_RETRY_BACKOFF",
          "exponential",
          invalid,
        ),
        signingToleranceSeconds: parseOptionalPositiveInteger(
          env,
          "WEBHOOK_SIGNING_TOLERANCE_SECONDS",
          300,
          invalid,
        ),
        retentionDays: parseOptionalPositiveInteger(
          env,
          "WEBHOOK_DELIVERY_RETENTION_DAYS",
          30,
          invalid,
        ),
      },
      effectiveConcurrency: {
        fallbackConcurrency: queueConcurrency,
        api: {
          uploadMaxConcurrentFiles: uploadLimits.maxConcurrentFiles,
          batchImportConcurrency,
          sourceWatchConcurrency,
        },
        workers: {
          sourceParseConcurrency,
          sourceOcrConcurrency: ocrConcurrency,
          mediaCaptionConcurrency: visionCaptionConcurrency,
          wikiAnalyzeConcurrency,
          wikiGenerateConcurrency,
          wikiMergeConcurrency,
          webhookDispatchConcurrency: webhookDeliveryConcurrency,
          deletionCleanupConcurrency,
        },
        internal: {
          ocrPageConcurrency,
          visionCaptionImageConcurrency,
        },
      },
      pressure: {
        uploadDegradedThreshold: uploadLimits.pressureDegradedThreshold,
        queueDepthDegradedThreshold: parseOptionalPositiveInteger(
          env,
          "RUNTIME_QUEUE_DEPTH_DEGRADED_THRESHOLD",
          20,
          invalid,
        ),
        queueDepthSaturatedThreshold: parseOptionalPositiveInteger(
          env,
          "RUNTIME_QUEUE_DEPTH_SATURATED_THRESHOLD",
          100,
          invalid,
        ),
        compileQueueDepthDegradedThreshold: parseOptionalPositiveInteger(
          env,
          "COMPILE_QUEUE_DEPTH_DEGRADED_THRESHOLD",
          10,
          invalid,
        ),
        compileQueueDepthSaturatedThreshold: parseOptionalPositiveInteger(
          env,
          "COMPILE_QUEUE_DEPTH_SATURATED_THRESHOLD",
          50,
          invalid,
        ),
        providerFailureDegradedThreshold: parseOptionalPositiveInteger(
          env,
          "PROVIDER_FAILURE_DEGRADED_THRESHOLD",
          3,
          invalid,
        ),
        expensiveValidationEnabled: parseOptionalBoolean(
          env,
          "EXPENSIVE_VALIDATION_ENABLED",
          false,
          invalid,
        ),
      },
    },
    cors: {
      origins: parseCorsOrigins(readRequired(env, "FOCOCONTEXT_CORS_ORIGINS")),
    },
    webhook: {
      secretConfigured: readOptional(env, "FOCOCONTEXT_WEBHOOK_SECRET") !== undefined,
      maskedSecret: maskSecret(readOptional(env, "FOCOCONTEXT_WEBHOOK_SECRET")),
      delivery: {
        enabled: parseOptionalBoolean(env, "WEBHOOK_DELIVERY_ENABLED", true, invalid),
      },
    },
    sourceWatch: {
      adapters: {
        mountedDirectory: {
          containerDir: sourceWatchContainerDir,
          enabled: true,
          ...(sourceWatchHostDir === undefined ? {} : { hostDir: sourceWatchHostDir }),
        },
        urlList: {
          allowedProtocols: parseOptionalStringList(env, "SOURCE_WATCH_URL_LIST_PROTOCOLS", [
            "http",
            "https",
          ]),
          concurrency: sourceWatchUrlListConcurrency,
          enabled: parseOptionalBoolean(env, "SOURCE_WATCH_URL_LIST_ENABLED", false, invalid),
          maxBytes: parseOptionalPositiveInteger(
            env,
            "SOURCE_WATCH_URL_LIST_MAX_RESPONSE_BYTES",
            1_048_576,
            invalid,
          ),
          maxItems: parseOptionalPositiveInteger(
            env,
            "SOURCE_WATCH_URL_LIST_MAX_URLS",
            100,
            invalid,
          ),
          maxRetries: parseOptionalNonNegativeInteger(
            env,
            "SOURCE_WATCH_URL_LIST_MAX_RETRIES",
            2,
            invalid,
          ),
          redirectLimit: parseOptionalNonNegativeInteger(
            env,
            "SOURCE_WATCH_URL_LIST_REDIRECT_LIMIT",
            3,
            invalid,
          ),
          retryBaseDelayMs: parseOptionalNonNegativeInteger(
            env,
            "SOURCE_WATCH_URL_LIST_RETRY_BASE_DELAY_MS",
            500,
            invalid,
          ),
          timeoutSeconds: parseOptionalPositiveInteger(
            env,
            "SOURCE_WATCH_URL_LIST_TIMEOUT_SECONDS",
            15,
            invalid,
          ),
        },
        s3Prefix: {
          accessKeyConfigured: sourceWatchS3AccessKeyId !== undefined,
          concurrency: sourceWatchS3Concurrency,
          enabled: parseOptionalBoolean(env, "SOURCE_WATCH_S3_ENABLED", false, invalid),
          forcePathStyle: parseOptionalBoolean(
            env,
            "SOURCE_WATCH_S3_FORCE_PATH_STYLE",
            true,
            invalid,
          ),
          maxBytes: parseOptionalPositiveInteger(
            env,
            "SOURCE_WATCH_S3_MAX_OBJECT_BYTES",
            20_971_520,
            invalid,
          ),
          maxItems: parseOptionalPositiveInteger(env, "SOURCE_WATCH_S3_MAX_OBJECTS", 1000, invalid),
          maxRetries: parseOptionalNonNegativeInteger(
            env,
            "SOURCE_WATCH_S3_MAX_RETRIES",
            2,
            invalid,
          ),
          retryBaseDelayMs: parseOptionalNonNegativeInteger(
            env,
            "SOURCE_WATCH_S3_RETRY_BASE_DELAY_MS",
            500,
            invalid,
          ),
          secretKeyConfigured: sourceWatchS3SecretAccessKey !== undefined,
          incrementalScanEnabled: objectStorageOperations.sourceWatchIncrementalScanEnabled,
          timeoutSeconds: parseOptionalPositiveInteger(
            env,
            "SOURCE_WATCH_S3_TIMEOUT_SECONDS",
            30,
            invalid,
          ),
          ...(sourceWatchS3AccessKeyId === undefined
            ? {}
            : { accessKeyId: sourceWatchS3AccessKeyId }),
          ...(sourceWatchS3Bucket === undefined ? {} : { bucket: sourceWatchS3Bucket }),
          ...(sourceWatchS3Endpoint === undefined ? {} : { endpoint: sourceWatchS3Endpoint }),
          ...(sourceWatchS3Region === undefined ? {} : { region: sourceWatchS3Region }),
          ...(sourceWatchS3SecretAccessKey === undefined
            ? {}
            : { secretAccessKey: sourceWatchS3SecretAccessKey }),
        },
        gitRepo: {
          allowedProtocols: parseOptionalStringList(env, "SOURCE_WATCH_GIT_PROTOCOLS", ["https"]),
          cloneDepth: parseOptionalPositiveInteger(env, "SOURCE_WATCH_GIT_CLONE_DEPTH", 1, invalid),
          concurrency: sourceWatchGitConcurrency,
          enabled: parseOptionalBoolean(env, "SOURCE_WATCH_GIT_ENABLED", false, invalid),
          maxBytes: parseOptionalPositiveInteger(
            env,
            "SOURCE_WATCH_GIT_MAX_FILE_BYTES",
            20_971_520,
            invalid,
          ),
          maxItems: parseOptionalPositiveInteger(env, "SOURCE_WATCH_GIT_MAX_FILES", 2000, invalid),
          maxRetries: parseOptionalNonNegativeInteger(
            env,
            "SOURCE_WATCH_GIT_MAX_RETRIES",
            1,
            invalid,
          ),
          retryBaseDelayMs: parseOptionalNonNegativeInteger(
            env,
            "SOURCE_WATCH_GIT_RETRY_BASE_DELAY_MS",
            1000,
            invalid,
          ),
          tempDir: readOptional(env, "SOURCE_WATCH_GIT_TEMP_DIR") ?? "/tmp/fococontext-git-watch",
          timeoutSeconds: parseOptionalPositiveInteger(
            env,
            "SOURCE_WATCH_GIT_TIMEOUT_SECONDS",
            60,
            invalid,
          ),
          tokenConfigured: readOptional(env, "SOURCE_WATCH_GIT_TOKEN") !== undefined,
        },
      },
      containerDir: sourceWatchContainerDir,
      ...(sourceWatchHostDir === undefined ? {} : { hostDir: sourceWatchHostDir }),
      scheduler: {
        defaultIntervalSeconds: sourceWatchScanIntervalSeconds,
        enabled: parseOptionalBoolean(env, "SOURCE_WATCH_SCHEDULER_ENABLED", true, invalid),
        maxRetries: sourceWatchScanMaxRetries,
        retryBaseDelayMs: sourceWatchScanRetryBaseDelayMs,
      },
    },
    ocr: {
      enabled: ocrEnabled,
      provider: ocrProvider,
      ...(ocrServiceBaseUrl === undefined ? {} : { serviceBaseUrl: ocrServiceBaseUrl }),
      ...(ocrServiceApiKey === undefined ? {} : { serviceApiKey: ocrServiceApiKey }),
      languages: ocrLanguages,
    },
    release: loadReleaseMetadata(env, "api"),
  };

  if (hasRerankConfig) {
    config.models.rerank = {
      providerName: readOptional(env, "RERANK_PROVIDER_NAME") ?? "",
      baseUrl: readOptional(env, "RERANK_BASE_URL") ?? "",
      apiKey: readOptional(env, "RERANK_API_KEY") ?? "",
      model: readOptional(env, "RERANK_MODEL") ?? "",
    };
  }

  if (visionCaptionEnabled && hasVisionCaptionConfig) {
    config.models.visionCaption = {
      providerName: readOptional(env, "VISION_CAPTION_PROVIDER_NAME") ?? "",
      baseUrl: readOptional(env, "VISION_CAPTION_BASE_URL") ?? "",
      apiKey: readOptional(env, "VISION_CAPTION_API_KEY") ?? "",
      model: readOptional(env, "VISION_CAPTION_MODEL") ?? "",
      requestMaxRetries: parseOptionalNonNegativeInteger(
        env,
        "VISION_CAPTION_MAX_RETRIES",
        2,
        invalid,
      ),
    };
  }

  if (invalid.length > 0) {
    throw new ApiError("invalid_request", {
      message: "Invalid runtime configuration.",
      details: {
        invalid,
      },
    });
  }

  return config;
}
