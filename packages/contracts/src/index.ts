import { randomUUID } from "node:crypto";

import {
  defaultApiLocale,
  hasApiMessageKey,
  resolveApiMessageKey,
  translateApiMessage,
  type ApiMessageKey,
  type ApiMessageParams,
  type SupportedApiLocale,
} from "./localization.js";

export {
  defaultApiLocale,
  hasApiMessageKey,
  isSupportedApiLocale,
  localizationGlossary,
  resolveApiLocale,
  resolveApiMessageKey,
  supportedApiLocales,
  translateApiMessage,
  translateApiMessageText,
  type ApiLocaleInput,
  type ApiMessageKey,
  type ApiMessageParams,
  type SupportedApiLocale,
} from "./localization.js";
export {
  isTerminalJobEventType,
  isTerminalJobStatus,
  normalizeJobTimelineEvents,
  resolveJobProgressState,
  type JobProgressEventType,
  type JobProgressStage,
  type JobProgressState,
  type JobProgressStateInput,
  type JobProgressStatus,
  type JobProgressTimelineEvent,
} from "./job-progress.js";

const requestIdPrefix = "req_";
const requestIdPattern = /^req_[a-zA-Z0-9]+$/;
const idBodyPattern = /^[a-zA-Z0-9]+$/;

export const resourceIdPrefixes = {
  knowledgeBase: "kb_",
  sourceDocument: "doc_",
  uploadSession: "ups_",
  ingestJob: "job_",
  parsedContent: "pc_",
  mediaAsset: "med_",
  wikiPage: "page_",
  pageVersion: "pgv_",
  knowledgeVersion: "kbv_",
  changeSet: "cs_",
  graphEdge: "edge_",
  knowledgeCheck: "check_",
  sourceWatchRule: "swr_",
  scheduledImportJob: "sij_",
  importPreview: "iprv_",
  webhook: "wh_",
  webhookDelivery: "whd_",
  retrievalTrace: "trace_",
  datasetConfiguration: "kbcfg_",
  datasetConfigurationSnapshot: "kbcfgs_",
  cleanupOperation: "cleanup_",
  backgroundOperation: "bgop_",
} as const;

export const webhookEventTypes = [
  "document.ingest.started",
  "document.ingest.completed",
  "document.ingest.failed",
  "wiki_draft.created",
  "knowledge_check.completed",
  "page.created",
  "page.updated",
  "change_set.created",
  "version.created",
  "rollback.completed",
  "knowledge_base.reindexed",
  "fork.sync.completed",
  "fork.sync.failed",
  "cleanup.completed",
  "cleanup.failed",
  "retrieve.readiness.changed",
  "webhook.test",
] as const;

const promptPurposes = [
  "analysis",
  "generation",
  "merge",
  "vision_caption",
  "knowledge_check",
  "wiki_draft",
] as const;

export const deletionCleanupTargetTypes = [
  "knowledge_base",
  "source_document",
  "source_watch_rule",
  "webhook",
  "import_preview",
  "retrieval_trace",
] as const;

export const deletionCleanupStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
] as const;

export const deletionCleanupPhases = [
  "queued",
  "manifest",
  "fencing",
  "object_cleanup",
  "database_cleanup",
  "retention",
  "completed",
  "failed",
  "canceled",
] as const;

export const deletionCleanupItemTypes = ["object", "database_row", "reference", "audit"] as const;

export const deletionCleanupItemStatuses = [
  "pending",
  "running",
  "deleted",
  "skipped",
  "failed",
] as const;

export const apiErrorDefinitions = {
  invalid_api_key: {
    httpStatus: 401,
    message: "Invalid API key.",
  },
  forbidden: {
    httpStatus: 403,
    message: "Forbidden.",
  },
  knowledge_base_not_found: {
    httpStatus: 404,
    message: "Knowledge base not found.",
  },
  document_not_found: {
    httpStatus: 404,
    message: "Document not found.",
  },
  job_not_found: {
    httpStatus: 404,
    message: "Job not found.",
  },
  upload_session_not_found: {
    httpStatus: 404,
    message: "Upload session not found.",
  },
  page_not_found: {
    httpStatus: 404,
    message: "Page not found.",
  },
  version_not_found: {
    httpStatus: 404,
    message: "Version not found.",
  },
  unsupported_file_type: {
    httpStatus: 400,
    message: "Unsupported file type.",
  },
  parser_failed: {
    httpStatus: 422,
    message: "Parser failed.",
  },
  parser_timeout: {
    httpStatus: 422,
    message: "Parser timeout.",
  },
  password_protected_pdf: {
    httpStatus: 422,
    message: "Password protected PDF.",
  },
  parser_output_empty: {
    httpStatus: 422,
    message: "Parser output empty.",
  },
  parser_limit_exceeded: {
    httpStatus: 413,
    message: "Parser limit exceeded.",
  },
  invalid_request: {
    httpStatus: 400,
    message: "Invalid request.",
  },
  invalid_locator: {
    httpStatus: 400,
    message: "Evidence locator is invalid.",
  },
  unsupported_evidence_kind: {
    httpStatus: 400,
    message: "Evidence kind is unsupported.",
  },
  evidence_limit_exceeded: {
    httpStatus: 413,
    message: "Source evidence limit exceeded.",
  },
  parsed_content_not_available: {
    httpStatus: 409,
    message: "Parsed content is not available.",
  },
  stale_source: {
    httpStatus: 409,
    message: "Source document is stale.",
  },
  ingest_failed: {
    httpStatus: 422,
    message: "Ingest failed.",
  },
  change_set_conflict: {
    httpStatus: 409,
    message: "Change set conflict.",
  },
  retrieve_index_not_ready: {
    httpStatus: 409,
    message: "Retrieve index not ready.",
  },
  durable_backend_unavailable: {
    httpStatus: 503,
    message: "Durable backend unavailable.",
  },
  bounded_retrieval_unavailable: {
    httpStatus: 503,
    message: "Bounded retrieval backend unavailable.",
  },
  graph_index_unavailable: {
    httpStatus: 503,
    message: "Graph index unavailable.",
  },
  redis_metrics_degraded: {
    httpStatus: 503,
    message: "Redis metrics degraded.",
  },
  fork_target_invalid: {
    httpStatus: 400,
    message: "Fork target is invalid.",
  },
  fork_submission_requires_fork: {
    httpStatus: 400,
    message: "Fork submission requires a forked knowledge base.",
  },
  document_delete_preview_required: {
    httpStatus: 409,
    message: "Document delete preview required.",
  },
  cleanup_operation_not_found: {
    httpStatus: 404,
    message: "Cleanup operation not found.",
  },
  cleanup_operation_not_retryable: {
    httpStatus: 409,
    message: "Cleanup operation is not retryable.",
  },
  resource_deleted: {
    httpStatus: 410,
    message: "Resource has been deleted.",
  },
  resource_cleanup_pending: {
    httpStatus: 409,
    message: "Resource cleanup is pending.",
  },
  resource_conflict: {
    httpStatus: 409,
    message: "Resource conflict.",
  },
  ingest_lock_conflict: {
    httpStatus: 409,
    message: "Ingest lock conflict.",
  },
  rate_limited: {
    httpStatus: 429,
    message: "Rate limited.",
  },
  admission_limited: {
    httpStatus: 429,
    message: "Admission limited.",
  },
  request_size_limit_exceeded: {
    httpStatus: 413,
    message: "Request size limit exceeded.",
  },
  retrieve_limit_exceeded: {
    httpStatus: 413,
    message: "Retrieve limit exceeded.",
  },
  export_limit_exceeded: {
    httpStatus: 413,
    message: "Export limit exceeded.",
  },
  internal_error: {
    httpStatus: 500,
    message: "Internal error.",
  },
} as const;

export type RequestId = `${typeof requestIdPrefix}${string}`;
export type ResourceType = keyof typeof resourceIdPrefixes;
export type WebhookEventType = (typeof webhookEventTypes)[number];
export type DeletionCleanupTargetType = (typeof deletionCleanupTargetTypes)[number];
export type DeletionCleanupStatus = (typeof deletionCleanupStatuses)[number];
export type DeletionCleanupPhase = (typeof deletionCleanupPhases)[number];
export type DeletionCleanupItemType = (typeof deletionCleanupItemTypes)[number];
export type DeletionCleanupItemStatus = (typeof deletionCleanupItemStatuses)[number];
export type ResourceId<TType extends ResourceType = ResourceType> =
  `${(typeof resourceIdPrefixes)[TType]}${string}`;
export type ApiErrorCode = keyof typeof apiErrorDefinitions;
export const objectStorageOperationClasses = ["class_a", "class_b", "free", "unknown"] as const;
export const objectStorageOperationStatuses = ["success", "error"] as const;
export const objectStorageOperationPressureStates = ["normal", "degraded", "disabled"] as const;

export type ObjectStorageOperationClass = (typeof objectStorageOperationClasses)[number];
export type ObjectStorageOperationStatus = (typeof objectStorageOperationStatuses)[number];
export type ObjectStorageOperationPressureState =
  (typeof objectStorageOperationPressureStates)[number];

export interface DurationSummary {
  count: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  latestMs: number;
}

export interface ObjectStorageOperationHotCaller {
  caller: string;
  count: number;
  classA: number;
  classB: number;
}

export interface ObjectStorageOperationHotOperation {
  operation: string;
  count: number;
  operationClass: ObjectStorageOperationClass;
}

export interface ObjectStorageOperationMetricsStatus {
  countsByCaller: Record<string, number>;
  countsByClass: Record<ObjectStorageOperationClass, number>;
  countsByOperation: Record<string, number>;
  countsByStatus: Record<ObjectStorageOperationStatus, number>;
  enabled: boolean;
  hotCallers: readonly ObjectStorageOperationHotCaller[];
  hotOperations: readonly ObjectStorageOperationHotOperation[];
  latency: DurationSummary | null;
  retryCount: number;
  total: number;
  windowSeconds: number;
}

export interface ObjectStorageOperationPressureStatus {
  classA: {
    count: number;
    warningThreshold: number;
  };
  classB: {
    count: number;
    warningThreshold: number;
  };
  guidanceKeys: readonly string[];
  hotCallers: readonly ObjectStorageOperationHotCaller[];
  hotOperations: readonly ObjectStorageOperationHotOperation[];
  metricsEnabled: boolean;
  status: ObjectStorageOperationPressureState;
  warningsEnabled: boolean;
  windowSeconds: number;
}

export interface RuntimeObjectStorageOperationLimits {
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

export interface SystemHealthStatus {
  dependencies?: {
    metrics?: {
      objectStorageOperations?: ObjectStorageOperationMetricsStatus;
      [key: string]: unknown;
    };
    pressure?: {
      objectStorageOperations?: ObjectStorageOperationPressureStatus;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  limits?: {
    objectStorageOperations?: RuntimeObjectStorageOperationLimits;
    [key: string]: unknown;
  };
  runtime?: Record<string, unknown>;
  status: string;
}

export interface DeletionCleanupOperationCounts {
  totalItemCount: number;
  pendingItemCount: number;
  deletedItemCount: number;
  skippedItemCount: number;
  failedItemCount: number;
  objectKeyCount: number;
  databaseRowCount: number;
}

export interface DeletionCleanupOperationRecord extends DeletionCleanupOperationCounts {
  id: string;
  targetType: DeletionCleanupTargetType;
  targetId: string;
  knowledgeBaseId: string | null;
  status: DeletionCleanupStatus;
  phase: DeletionCleanupPhase;
  requestedBy: string | null;
  requestId: string | null;
  queueJobId: string | null;
  manifest: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  retryAfter: string | null;
  retryable: boolean;
  lastError: Record<string, unknown> | null;
  retentionExpiresAt: string | null;
  itemRetentionExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeletionCleanupItemRecord {
  id: string;
  operationId: string;
  itemType: DeletionCleanupItemType;
  resourceType: string | null;
  resourceId: string | null;
  objectKey: string | null;
  tableName: string | null;
  knowledgeBaseId: string | null;
  sourceDocumentId: string | null;
  status: DeletionCleanupItemStatus;
  phase: DeletionCleanupPhase;
  attemptCount: number;
  maxAttempts: number;
  lastError: Record<string, unknown> | null;
  skipReason: string | null;
  retryAfter: string | null;
  retainedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DeletionCleanupRepositorySnapshot {
  operations: readonly DeletionCleanupOperationRecord[];
  items: readonly DeletionCleanupItemRecord[];
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
  next_cursor?: string | null;
}

export interface SuccessEnvelope<TData> {
  data: TData;
  request_id: RequestId;
}

export interface ListEnvelope<TItem> {
  data: readonly TItem[];
  pagination: Pagination;
  request_id: RequestId;
}

export interface ListEnvelopeInput extends Pagination {
  requestId: RequestId;
}

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  locale?: SupportedApiLocale;
  message_key?: ApiMessageKey;
}

export interface ErrorEnvelope {
  error: ApiErrorPayload;
  request_id: RequestId;
}

export interface ApiErrorOptions {
  message?: string;
  messageKey?: ApiMessageKey | undefined;
  messageParams?: ApiMessageParams | undefined;
  details?: unknown;
  cause?: unknown;
}

export interface ApiErrorResponse {
  statusCode: number;
  body: ErrorEnvelope;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;
  readonly messageKey: ApiMessageKey | undefined;
  readonly messageParams: ApiMessageParams | undefined;

  constructor(code: ApiErrorCode, options: ApiErrorOptions = {}) {
    const definition = apiErrorDefinitions[code];

    super(options.message ?? definition.message, { cause: options.cause });

    this.name = "ApiError";
    this.code = code;
    this.httpStatus = definition.httpStatus;

    if (options.details !== undefined) {
      this.details = options.details;
    }

    this.messageKey = options.messageKey;
    this.messageParams = options.messageParams;
  }
}

export function createRequestId(): RequestId {
  return `${requestIdPrefix}${randomUUID().replaceAll("-", "")}`;
}

export function isRequestId(value: unknown): value is RequestId {
  return (
    typeof value === "string" &&
    requestIdPattern.test(value) &&
    value.length > requestIdPrefix.length
  );
}

export function createResourceId<TType extends ResourceType>(
  type: TType,
  entropy: () => string = () => randomUUID().replaceAll("-", ""),
): ResourceId<TType> {
  return `${resourceIdPrefixes[type]}${entropy()}` as ResourceId<TType>;
}

export function isResourceId<TType extends ResourceType>(
  value: unknown,
  type: TType,
): value is ResourceId<TType> {
  if (typeof value !== "string") {
    return false;
  }

  const prefix = resourceIdPrefixes[type];
  const body = value.slice(prefix.length);

  return value.startsWith(prefix) && body.length > 0 && idBodyPattern.test(body);
}

export function getHttpStatusForErrorCode(code: ApiErrorCode): number {
  return apiErrorDefinitions[code].httpStatus;
}

export function createSuccessEnvelope<TData>(
  data: TData,
  requestId: RequestId,
): SuccessEnvelope<TData> {
  return {
    data,
    request_id: requestId,
  };
}

export function createListEnvelope<TItem>(
  data: readonly TItem[],
  input: ListEnvelopeInput,
): ListEnvelope<TItem> {
  const { page, page_size, total, has_more, next_cursor, requestId } = input;
  const pagination: Pagination = {
    page,
    page_size,
    total,
    has_more,
  };

  if (next_cursor !== undefined) {
    pagination.next_cursor = next_cursor;
  }

  return {
    data,
    pagination,
    request_id: requestId,
  };
}

export function createErrorEnvelope(error: ApiErrorPayload, requestId: RequestId): ErrorEnvelope {
  const errorPayload: ApiErrorPayload = {
    code: error.code,
    message: error.message,
  };

  if (error.locale !== undefined) {
    errorPayload.locale = error.locale;
  }

  if (error.message_key !== undefined) {
    errorPayload.message_key = error.message_key;
  }

  if (error.details !== undefined) {
    errorPayload.details = error.details;
  }

  return {
    error: errorPayload,
    request_id: requestId,
  };
}

export interface ApiErrorResponseMappingOptions {
  locale?: SupportedApiLocale | undefined;
}

export function mapApiErrorToResponse(
  error: ApiError,
  requestId: RequestId,
  options: ApiErrorResponseMappingOptions = {},
): ApiErrorResponse {
  const locale = options.locale ?? defaultApiLocale;
  const defaultMessageKey = `api.error.${error.code}`;
  const messageKey =
    error.messageKey ??
    resolveApiMessageKey(error.message) ??
    (hasApiMessageKey(defaultMessageKey) ? defaultMessageKey : undefined);
  const message =
    messageKey === undefined
      ? error.message
      : translateApiMessage(messageKey, locale, error.messageParams);

  return {
    statusCode: error.httpStatus,
    body: createErrorEnvelope(
      createLocalizedApiErrorPayload(error, message, locale, messageKey),
      requestId,
    ),
  };
}

function createLocalizedApiErrorPayload(
  error: ApiError,
  message: string,
  locale: SupportedApiLocale,
  messageKey: ApiMessageKey | undefined,
): ApiErrorPayload {
  const payload: ApiErrorPayload = {
    code: error.code,
    message,
    locale,
  };

  if (messageKey !== undefined) {
    payload.message_key = messageKey;
  }

  if (error.details !== undefined) {
    payload.details = redactSensitiveDetails(error.details);
  }

  return payload;
}

const redactedValue = "[redacted]";
const sensitiveDetailKeyPattern =
  /(?:api[_-]?key|authorization|cookie|password|secret|session|token|credential|private[_-]?key)/iu;

function redactSensitiveDetails(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);
    return value.map((item) => redactSensitiveDetails(item, seen));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  seen.add(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveDetailKeyPattern.test(key) ? redactedValue : redactSensitiveDetails(item, seen),
    ]),
  );
}

export function mapUnknownErrorToResponse(
  error: unknown,
  requestId: RequestId,
  options: ApiErrorResponseMappingOptions = {},
): ApiErrorResponse {
  if (error instanceof ApiError) {
    return mapApiErrorToResponse(error, requestId, options);
  }

  return mapApiErrorToResponse(new ApiError("internal_error"), requestId, options);
}

const errorCodeEnum = Object.keys(apiErrorDefinitions) as ApiErrorCode[];

function createPrefixedIdSchema(prefix: string) {
  return {
    type: "string",
    pattern: `^${prefix}[a-zA-Z0-9]+$`,
  };
}

const standardJsonResponse = {
  description: "Standard JSON response envelope",
  content: {
    "application/json": {
      schema: {
        $ref: "#/components/schemas/SuccessEnvelope",
      },
    },
  },
};

function jsonRequestBody(schemaRef: string, example?: unknown) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: {
          $ref: schemaRef,
        },
        ...(example === undefined ? {} : { example }),
      },
    },
  };
}

function jsonResponse(description: string, schemaRef: string, example?: unknown) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          allOf: [
            {
              $ref: "#/components/schemas/SuccessEnvelope",
            },
            {
              type: "object",
              properties: {
                data: {
                  $ref: schemaRef,
                },
              },
            },
          ],
        },
        ...(example === undefined ? {} : { example }),
      },
    },
  };
}

function listJsonResponse(description: string, itemSchemaRef: string, example?: unknown) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          allOf: [
            {
              $ref: "#/components/schemas/ListEnvelope",
            },
            {
              type: "object",
              properties: {
                data: {
                  type: "array",
                  items: {
                    $ref: itemSchemaRef,
                  },
                },
              },
            },
          ],
        },
        ...(example === undefined ? {} : { example }),
      },
    },
  };
}

const standardErrorResponses = {
  "400": {
    $ref: "#/components/responses/BadRequest",
  },
  "401": {
    $ref: "#/components/responses/Unauthorized",
  },
  "403": {
    $ref: "#/components/responses/Forbidden",
  },
  "409": {
    $ref: "#/components/responses/Conflict",
  },
  "413": {
    $ref: "#/components/responses/PayloadTooLarge",
  },
  "429": {
    $ref: "#/components/responses/TooManyRequests",
  },
  "503": {
    $ref: "#/components/responses/ServiceUnavailable",
  },
  "500": {
    $ref: "#/components/responses/InternalServerError",
  },
} as const;

const paginationParameters = [
  { $ref: "#/components/parameters/Page" },
  { $ref: "#/components/parameters/PageSize" },
] as const;

const cursorPaginationParameters = [
  { $ref: "#/components/parameters/Page" },
  { $ref: "#/components/parameters/PageSize" },
  { $ref: "#/components/parameters/Cursor" },
  { $ref: "#/components/parameters/Limit" },
] as const;

export const openApiComponents = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      description:
        "Use `Authorization: Bearer <FOCOCONTEXT_API_KEY>` for external developer API calls. Each key resolves to one tenant/project scope and route permission set. Authenticated Admin Console browser requests use the admin session cookie and do not expose API keys to the browser.",
    },
  },
  parameters: {
    Locale: {
      name: "X-Fococontext-Locale",
      in: "header",
      required: false,
      description:
        "Preferred locale for human-readable API messages. Supported values are `en-US` and `zh-CN`.",
      schema: {
        type: "string",
        enum: ["en-US", "zh-CN"],
      },
    },
    AcceptLanguage: {
      name: "Accept-Language",
      in: "header",
      required: false,
      description:
        "Fallback locale negotiation header for human-readable API messages when `X-Fococontext-Locale` is not provided.",
      schema: {
        type: "string",
      },
    },
    Page: {
      name: "page",
      in: "query",
      required: false,
      description: "Page number for list endpoints. Values start at 1.",
      schema: {
        default: 1,
        minimum: 1,
        type: "integer",
      },
    },
    PageSize: {
      name: "page_size",
      in: "query",
      required: false,
      description: "Number of rows to return per page.",
      schema: {
        default: 20,
        maximum: 100,
        minimum: 1,
        type: "integer",
      },
    },
    Cursor: {
      name: "cursor",
      in: "query",
      required: false,
      description: "Opaque cursor returned in `pagination.next_cursor` by cursor-enabled lists.",
      schema: {
        type: "string",
      },
    },
    Limit: {
      name: "limit",
      in: "query",
      required: false,
      description:
        "Cursor page size alias for cursor-enabled lists. When both `limit` and `page_size` are provided, `limit` is used.",
      schema: {
        default: 20,
        maximum: 100,
        minimum: 1,
        type: "integer",
      },
    },
    CleanupItemsPage: {
      name: "items_page",
      in: "query",
      required: false,
      description: "Page number for cleanup operation items. Values start at 1.",
      schema: {
        default: 1,
        minimum: 1,
        type: "integer",
      },
    },
    CleanupItemsPageSize: {
      name: "items_page_size",
      in: "query",
      required: false,
      description: "Number of cleanup operation items to return per page.",
      schema: {
        default: 100,
        maximum: 500,
        minimum: 1,
        type: "integer",
      },
    },
  },
  responses: {
    BadRequest: {
      description: "The request is invalid. See `error.details` for field-level context.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
    Unauthorized: {
      description: "The Bearer API key is missing or invalid.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
    Forbidden: {
      description:
        "The authenticated API key or Admin session is valid but lacks the required route or documentation permission.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
    Conflict: {
      description:
        "A scoped uniqueness constraint or idempotency boundary rejected the request. Duplicate natural keys use `resource_conflict` with structured `error.details`.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
    PayloadTooLarge: {
      description:
        "The request, upload, retrieve response, source evidence response, parser output, or export exceeds a configured request or output limit.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
    TooManyRequests: {
      description:
        "The caller exceeded a configured route, admission, queue, upload, retrieve, source evidence, or export limit. `error.details` may include safe retry metadata.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
    ServiceUnavailable: {
      description:
        "A durable backend, queue or provider dependency is unavailable or over pressure. Use `request_id` and retry metadata for support correlation.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
    InternalServerError: {
      description: "The server failed unexpectedly. Use `request_id` for support correlation.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ErrorEnvelope",
          },
        },
      },
    },
  },
  schemas: {
    RequestId: createPrefixedIdSchema(requestIdPrefix),
    ResourceId: {
      type: "string",
      pattern: "^[a-z]+_[a-zA-Z0-9]+$",
    },
    ApiNextActionLink: {
      type: "object",
      required: ["rel", "method", "href", "resource_type"],
      properties: {
        rel: {
          type: "string",
          description: "Stable relation key. Clients may ignore unknown relation keys.",
        },
        method: {
          type: "string",
          enum: ["GET", "POST"],
        },
        href: {
          type: "string",
          description:
            "Authenticated relative `/v1` API path. It never embeds API keys, bearer tokens, or session secrets.",
        },
        resource_type: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    KnowledgeBaseId: createPrefixedIdSchema(resourceIdPrefixes.knowledgeBase),
    SourceDocumentId: createPrefixedIdSchema(resourceIdPrefixes.sourceDocument),
    UploadSessionId: createPrefixedIdSchema(resourceIdPrefixes.uploadSession),
    IngestJobId: createPrefixedIdSchema(resourceIdPrefixes.ingestJob),
    ParsedContentId: createPrefixedIdSchema(resourceIdPrefixes.parsedContent),
    MediaAssetId: createPrefixedIdSchema(resourceIdPrefixes.mediaAsset),
    WikiPageId: createPrefixedIdSchema(resourceIdPrefixes.wikiPage),
    PageVersionId: createPrefixedIdSchema(resourceIdPrefixes.pageVersion),
    KnowledgeVersionId: createPrefixedIdSchema(resourceIdPrefixes.knowledgeVersion),
    ChangeSetId: createPrefixedIdSchema(resourceIdPrefixes.changeSet),
    GraphEdgeId: createPrefixedIdSchema(resourceIdPrefixes.graphEdge),
    KnowledgeCheckId: createPrefixedIdSchema(resourceIdPrefixes.knowledgeCheck),
    SourceWatchRuleId: createPrefixedIdSchema(resourceIdPrefixes.sourceWatchRule),
    ScheduledImportJobId: createPrefixedIdSchema(resourceIdPrefixes.scheduledImportJob),
    ImportPreviewId: createPrefixedIdSchema(resourceIdPrefixes.importPreview),
    WebhookId: createPrefixedIdSchema(resourceIdPrefixes.webhook),
    WebhookDeliveryId: createPrefixedIdSchema(resourceIdPrefixes.webhookDelivery),
    RetrievalTraceId: createPrefixedIdSchema(resourceIdPrefixes.retrievalTrace),
    DatasetConfigurationId: createPrefixedIdSchema(resourceIdPrefixes.datasetConfiguration),
    DatasetConfigurationSnapshotId: createPrefixedIdSchema(
      resourceIdPrefixes.datasetConfigurationSnapshot,
    ),
    CleanupOperationId: createPrefixedIdSchema(resourceIdPrefixes.cleanupOperation),
    ObjectStorageOperationClass: {
      type: "string",
      enum: [...objectStorageOperationClasses],
      description:
        "Provider-neutral S3-compatible operation class used for request-volume attribution.",
    },
    ObjectStorageOperationStatus: {
      type: "string",
      enum: [...objectStorageOperationStatuses],
    },
    ObjectStorageOperationPressureState: {
      type: "string",
      enum: [...objectStorageOperationPressureStates],
    },
    ObjectStorageOperationHotCaller: {
      type: "object",
      required: ["caller", "count", "classA", "classB"],
      properties: {
        caller: {
          type: "string",
        },
        count: {
          type: "integer",
          minimum: 0,
        },
        classA: {
          type: "integer",
          minimum: 0,
        },
        classB: {
          type: "integer",
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
    ObjectStorageOperationHotOperation: {
      type: "object",
      required: ["operation", "count", "operationClass"],
      properties: {
        operation: {
          type: "string",
        },
        count: {
          type: "integer",
          minimum: 0,
        },
        operationClass: {
          $ref: "#/components/schemas/ObjectStorageOperationClass",
        },
      },
      additionalProperties: false,
    },
    ObjectStorageOperationMetrics: {
      type: "object",
      description:
        "Safe provider-neutral S3-compatible operation metrics grouped by class, caller, operation, and status.",
      required: [
        "countsByCaller",
        "countsByClass",
        "countsByOperation",
        "countsByStatus",
        "enabled",
        "hotCallers",
        "hotOperations",
        "latency",
        "retryCount",
        "total",
        "windowSeconds",
      ],
      properties: {
        countsByCaller: {
          type: "object",
          additionalProperties: {
            type: "integer",
            minimum: 0,
          },
        },
        countsByClass: {
          type: "object",
          required: [...objectStorageOperationClasses],
          properties: Object.fromEntries(
            objectStorageOperationClasses.map((operationClass) => [
              operationClass,
              {
                type: "integer",
                minimum: 0,
              },
            ]),
          ),
          additionalProperties: false,
        },
        countsByOperation: {
          type: "object",
          additionalProperties: {
            type: "integer",
            minimum: 0,
          },
        },
        countsByStatus: {
          type: "object",
          required: [...objectStorageOperationStatuses],
          properties: Object.fromEntries(
            objectStorageOperationStatuses.map((status) => [
              status,
              {
                type: "integer",
                minimum: 0,
              },
            ]),
          ),
          additionalProperties: false,
        },
        enabled: {
          type: "boolean",
        },
        hotCallers: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ObjectStorageOperationHotCaller",
          },
        },
        hotOperations: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ObjectStorageOperationHotOperation",
          },
        },
        latency: {
          oneOf: [
            {
              type: "object",
              required: ["count", "avgMs", "maxMs", "minMs", "latestMs"],
              properties: {
                count: {
                  type: "integer",
                  minimum: 0,
                },
                avgMs: {
                  type: "number",
                  minimum: 0,
                },
                maxMs: {
                  type: "number",
                  minimum: 0,
                },
                minMs: {
                  type: "number",
                  minimum: 0,
                },
                latestMs: {
                  type: "number",
                  minimum: 0,
                },
              },
              additionalProperties: false,
            },
            {
              type: "null",
            },
          ],
        },
        retryCount: {
          type: "integer",
          minimum: 0,
        },
        total: {
          type: "integer",
          minimum: 0,
        },
        windowSeconds: {
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    ObjectStorageOperationPressure: {
      type: "object",
      description:
        "Provider-neutral operation pressure for S3-compatible storage. Exact prices and billing names depend on the configured provider.",
      required: [
        "classA",
        "classB",
        "guidanceKeys",
        "hotCallers",
        "hotOperations",
        "metricsEnabled",
        "status",
        "warningsEnabled",
        "windowSeconds",
      ],
      properties: {
        classA: {
          type: "object",
          required: ["count", "warningThreshold"],
          properties: {
            count: {
              type: "integer",
              minimum: 0,
            },
            warningThreshold: {
              type: "integer",
              minimum: 1,
            },
          },
          additionalProperties: false,
        },
        classB: {
          type: "object",
          required: ["count", "warningThreshold"],
          properties: {
            count: {
              type: "integer",
              minimum: 0,
            },
            warningThreshold: {
              type: "integer",
              minimum: 1,
            },
          },
          additionalProperties: false,
        },
        guidanceKeys: {
          type: "array",
          items: {
            type: "string",
          },
        },
        hotCallers: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ObjectStorageOperationHotCaller",
          },
        },
        hotOperations: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ObjectStorageOperationHotOperation",
          },
        },
        metricsEnabled: {
          type: "boolean",
        },
        status: {
          $ref: "#/components/schemas/ObjectStorageOperationPressureState",
        },
        warningsEnabled: {
          type: "boolean",
        },
        windowSeconds: {
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    RuntimeObjectStorageOperationLimits: {
      type: "object",
      description: "Safe env-first limits for S3-compatible operation instrumentation and tuning.",
      required: [
        "metricsEnabled",
        "pressureWarningsEnabled",
        "metricsWindowSeconds",
        "classAWarningThreshold",
        "classBWarningThreshold",
        "previewCacheEnabled",
        "previewMaxChars",
        "sourceWatchIncrementalScanEnabled",
        "multipartPartSizeBytes",
      ],
      properties: {
        metricsEnabled: {
          type: "boolean",
        },
        pressureWarningsEnabled: {
          type: "boolean",
        },
        metricsWindowSeconds: {
          type: "integer",
          minimum: 1,
        },
        classAWarningThreshold: {
          type: "integer",
          minimum: 1,
        },
        classBWarningThreshold: {
          type: "integer",
          minimum: 1,
        },
        previewCacheEnabled: {
          type: "boolean",
        },
        previewMaxChars: {
          type: "integer",
          minimum: 1,
        },
        sourceWatchIncrementalScanEnabled: {
          type: "boolean",
        },
        multipartPartSizeBytes: {
          type: "integer",
          minimum: 5242880,
        },
      },
      additionalProperties: false,
    },
    CleanupStatus: {
      type: "string",
      enum: ["queued", "running", "completed", "failed", "canceled"],
    },
    CleanupPhase: {
      type: "string",
      enum: [
        "queued",
        "manifest",
        "fencing",
        "object_cleanup",
        "database_cleanup",
        "retention",
        "completed",
        "failed",
        "canceled",
      ],
    },
    PromptPurpose: {
      type: "string",
      enum: [...promptPurposes],
    },
    PromptTemplateMode: {
      type: "string",
      enum: ["built_in", "custom_instructions", "override_template"],
    },
    DatasetPromptTemplateValue: {
      type: "object",
      required: ["mode", "built_in_prompt_id", "custom_instructions", "override_template"],
      properties: {
        mode: {
          $ref: "#/components/schemas/PromptTemplateMode",
        },
        built_in_prompt_id: {
          type: "string",
        },
        custom_instructions: {
          type: ["string", "null"],
          maxLength: 12000,
        },
        override_template: {
          type: ["string", "null"],
          maxLength: 24000,
        },
        updated_at: {
          type: ["string", "null"],
          format: "date-time",
        },
      },
      additionalProperties: false,
    },
    DatasetConfigurationValues: {
      type: "object",
      required: [
        "purpose",
        "schema",
        "markdown_contract",
        "output_language",
        "retrieval",
        "source_lifecycle",
        "knowledge_check",
        "source_watch",
        "ocr_policy",
        "prompt_templates",
      ],
      properties: {
        prompt_templates: {
          type: "object",
          required: [...promptPurposes],
          properties: Object.fromEntries(
            promptPurposes.map((purpose) => [
              purpose,
              {
                $ref: "#/components/schemas/DatasetPromptTemplateValue",
              },
            ]),
          ),
          additionalProperties: false,
        },
        ocr_policy: {
          type: "object",
          required: ["mode", "max_pages_per_document", "min_text_chars_per_page"],
          properties: {
            mode: {
              type: "string",
              enum: ["auto", "disabled", "force_for_pdf"],
            },
            max_pages_per_document: {
              type: ["integer", "null"],
              minimum: 1,
            },
            min_text_chars_per_page: {
              type: ["integer", "null"],
              minimum: 1,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: true,
    },
    DatasetConfiguration: {
      type: "object",
      required: [
        "id",
        "knowledge_base_id",
        "preset_id",
        "status",
        "version",
        "values",
        "latest_snapshot_id",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/DatasetConfigurationId",
        },
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        latest_snapshot_id: {
          $ref: "#/components/schemas/DatasetConfigurationSnapshotId",
        },
        values: {
          $ref: "#/components/schemas/DatasetConfigurationValues",
        },
      },
      additionalProperties: true,
    },
    DatasetConfigurationPreset: {
      type: "object",
      required: ["id", "name", "description", "version", "default_values", "validation"],
      properties: {
        default_values: {
          $ref: "#/components/schemas/DatasetConfigurationValues",
        },
      },
      additionalProperties: true,
    },
    VisibilityOrigin: {
      type: "string",
      enum: ["canonical", "upstream_inherited", "fork_owned"],
      description:
        "Identifies whether a returned resource belongs to the canonical Knowledge Base, is inherited by a fork, or is fork-owned overlay data.",
    },
    ForkOwner: {
      type: "object",
      required: ["owner_type", "external_owner_id", "display_name"],
      properties: {
        owner_type: {
          type: "string",
          enum: ["user", "workspace", "customer", "session", "custom"],
        },
        external_owner_id: {
          type: "string",
        },
        display_name: {
          type: ["string", "null"],
        },
      },
      additionalProperties: false,
    },
    KnowledgeBase: {
      type: "object",
      required: [
        "id",
        "name",
        "slug",
        "knowledge_base_type",
        "upstream_knowledge_base_id",
        "upstream_base_version_id",
        "upstream_synced_version_id",
        "fork_owner",
        "sync_status",
        "template",
        "output_language",
        "status",
        "current_version_id",
        "purpose",
        "schema",
        "retrieval",
        "created_at",
        "updated_at",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        name: {
          type: "string",
        },
        slug: {
          type: "string",
        },
        description: {
          type: "string",
        },
        knowledge_base_type: {
          type: "string",
          enum: ["canonical", "fork"],
        },
        upstream_knowledge_base_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeBaseId" }, { type: "null" }],
        },
        upstream_base_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
        upstream_synced_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
        fork_owner: {
          oneOf: [{ $ref: "#/components/schemas/ForkOwner" }, { type: "null" }],
        },
        sync_status: {
          type: "string",
          enum: ["not_applicable", "synced", "outdated", "syncing", "failed"],
        },
        current_version_id: {
          $ref: "#/components/schemas/KnowledgeVersionId",
        },
        schema: {
          type: "object",
          additionalProperties: true,
        },
        retrieval: {
          type: "object",
          additionalProperties: true,
        },
        created_at: {
          $ref: "#/components/schemas/Timestamp",
        },
        updated_at: {
          $ref: "#/components/schemas/Timestamp",
        },
      },
      additionalProperties: true,
    },
    ForkResolveRequest: {
      type: "object",
      required: ["owner_type", "external_owner_id"],
      properties: {
        owner_type: {
          type: "string",
          enum: ["user", "workspace", "customer", "session", "custom"],
        },
        external_owner_id: {
          type: "string",
        },
        display_name: {
          type: ["string", "null"],
        },
        upstream_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
      },
      additionalProperties: false,
    },
    ForkResolveResponse: {
      type: "object",
      required: ["created", "fork"],
      properties: {
        created: {
          type: "boolean",
        },
        fork: {
          $ref: "#/components/schemas/KnowledgeBase",
        },
      },
      additionalProperties: false,
    },
    ForkSyncRequest: {
      type: "object",
      properties: {
        target_upstream_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
      },
      additionalProperties: false,
    },
    ForkSyncResponse: {
      type: "object",
      required: [
        "fork_id",
        "sync_status",
        "operation_id",
        "change_set_id",
        "source_upstream_version_id",
        "target_upstream_version_id",
        "current_fork_version_id",
        "conflicts",
      ],
      properties: {
        fork_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        sync_status: {
          type: "string",
          enum: ["synced", "outdated", "syncing", "failed"],
        },
        operation_id: {
          type: ["string", "null"],
        },
        change_set_id: {
          oneOf: [{ $ref: "#/components/schemas/ChangeSetId" }, { type: "null" }],
        },
        source_upstream_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
        target_upstream_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
        current_fork_version_id: {
          $ref: "#/components/schemas/KnowledgeVersionId",
        },
        conflicts: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "upstream_page_id", "fork_page_id", "slug", "title"],
            properties: {
              type: {
                type: "string",
                enum: ["fork_page_conflict"],
              },
              upstream_page_id: {
                $ref: "#/components/schemas/PageId",
              },
              fork_page_id: {
                $ref: "#/components/schemas/PageId",
              },
              slug: {
                type: "string",
              },
              title: {
                type: "string",
              },
            },
            additionalProperties: true,
          },
        },
      },
      additionalProperties: true,
    },
    ForkDeleteResponse: {
      type: "object",
      required: ["id", "status", "cleanup"],
      properties: {
        id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        status: {
          type: "string",
          enum: ["deleted"],
        },
        cleanup: {
          $ref: "#/components/schemas/CleanupOperation",
        },
      },
      additionalProperties: false,
    },
    SourceDocument: {
      type: "object",
      required: [
        "id",
        "knowledge_base_id",
        "name",
        "display_name",
        "source_type",
        "mime_type",
        "size",
        "content_hash",
        "object_key",
        "status",
        "metadata",
        "created_at",
        "updated_at",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        name: {
          type: "string",
        },
        display_name: {
          type: "string",
        },
        source_type: {
          type: "string",
          enum: ["file", "text", "url", "wiki_draft"],
        },
        mime_type: {
          type: "string",
        },
        size: {
          type: "integer",
          minimum: 0,
        },
        content_hash: {
          type: "string",
          pattern: "^sha256:[a-f0-9]{64}$",
        },
        object_key: {
          type: "string",
        },
        status: {
          type: "string",
          enum: ["uploaded", "queued", "processing", "ready", "failed", "deleted"],
        },
        source_path: {
          type: "string",
        },
        source_url: {
          type: "string",
          format: "uri",
        },
        metadata: {
          $ref: "#/components/schemas/CommonMetadata",
        },
        visibility_origin: {
          $ref: "#/components/schemas/VisibilityOrigin",
        },
        owner_knowledge_base_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeBaseId" }, { type: "null" }],
        },
        upstream_resource_id: {
          oneOf: [{ $ref: "#/components/schemas/ResourceId" }, { type: "null" }],
        },
        fork_tombstoned_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
        created_at: {
          $ref: "#/components/schemas/Timestamp",
        },
        updated_at: {
          $ref: "#/components/schemas/Timestamp",
        },
      },
      additionalProperties: true,
    },
    ForkSubmissionEvidence: {
      type: "object",
      properties: {
        source_type: {
          type: "string",
          description: "Developer-provided provenance type such as web, file, api, or user.",
        },
        title: {
          type: "string",
        },
        url: {
          type: "string",
          format: "uri",
        },
        snippet: {
          type: "string",
        },
        metadata: {
          $ref: "#/components/schemas/CommonMetadata",
        },
      },
      additionalProperties: false,
    },
    ForkSubmissionCitation: {
      type: "object",
      properties: {
        label: {
          type: "string",
        },
        title: {
          type: "string",
        },
        url: {
          type: "string",
          format: "uri",
        },
        locator: {
          type: "string",
        },
        metadata: {
          $ref: "#/components/schemas/CommonMetadata",
        },
      },
      additionalProperties: false,
    },
    CreateForkSubmissionRequest: {
      type: "object",
      required: ["title", "content"],
      properties: {
        title: {
          type: "string",
        },
        content: {
          type: "string",
        },
        content_type: {
          type: "string",
          enum: ["markdown", "text"],
          default: "markdown",
        },
        source_path: {
          type: "string",
        },
        source_url: {
          type: "string",
          format: "uri",
        },
        evidence: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ForkSubmissionEvidence",
          },
        },
        citations: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ForkSubmissionCitation",
          },
        },
        metadata: {
          $ref: "#/components/schemas/CommonMetadata",
        },
      },
      additionalProperties: false,
    },
    ForkSubmissionResponse: {
      type: "object",
      required: [
        "fork_id",
        "upstream_knowledge_base_id",
        "document",
        "job",
        "evidence",
        "citations",
      ],
      properties: {
        fork_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        upstream_knowledge_base_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeBaseId" }, { type: "null" }],
        },
        document: {
          $ref: "#/components/schemas/SourceDocument",
        },
        job: {
          $ref: "#/components/schemas/IngestJob",
        },
        evidence: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ForkSubmissionEvidence",
          },
        },
        citations: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ForkSubmissionCitation",
          },
        },
      },
      additionalProperties: true,
    },
    Timestamp: {
      type: "string",
      format: "date-time",
    },
    CommonMetadata: {
      type: "object",
      additionalProperties: true,
    },
    CaptionStatus: {
      type: "string",
      enum: ["not_configured", "pending", "generated", "skipped", "failed"],
    },
    OcrStatus: {
      type: "string",
      enum: ["not_required", "skipped", "pending", "running", "succeeded", "failed"],
    },
    OcrWarning: {
      type: "object",
      properties: {
        kind: {
          type: "string",
        },
        message: {
          type: "string",
        },
        locator: {
          type: "object",
          description: "OCR source locator for the warning, usually a page or block locator.",
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    OcrBlock: {
      type: "object",
      required: ["page_number", "block_index", "text", "provider", "engine"],
      properties: {
        page_number: {
          type: "integer",
          minimum: 1,
        },
        block_index: {
          type: "integer",
          minimum: 0,
        },
        block_end_index: {
          type: "integer",
          minimum: 0,
          description: "Inclusive end block index when the OCR locator covers a block range.",
        },
        text: {
          type: "string",
        },
        confidence: {
          type: ["number", "null"],
          minimum: 0,
          maximum: 1,
        },
        bbox: {
          type: ["array", "null"],
          items: {},
        },
        language: {
          type: ["string", "null"],
        },
        provider: {
          type: "string",
        },
        engine: {
          type: "string",
        },
        model_version: {
          type: ["string", "null"],
        },
        locator: {
          type: "object",
          description: "OCR source locator for this block.",
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    OcrPageStatus: {
      type: "object",
      required: ["page_number", "status"],
      properties: {
        page_number: {
          type: "integer",
          minimum: 1,
        },
        status: {
          $ref: "#/components/schemas/OcrStatus",
        },
        reason: {
          type: ["string", "null"],
        },
        block_count: {
          type: "integer",
          minimum: 0,
        },
        attempt_count: {
          type: "integer",
          minimum: 0,
        },
        warnings: {
          type: "array",
          items: {
            $ref: "#/components/schemas/OcrWarning",
          },
        },
      },
      additionalProperties: true,
    },
    OcrRetryRequest: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["retry_failed", "reprocess", "force_for_pdf"],
        },
        page_numbers: {
          type: "array",
          items: {
            type: "integer",
            minimum: 1,
          },
        },
      },
      additionalProperties: false,
    },
    MediaAssetCaptionError: {
      type: "object",
      description:
        "Safe caption error summary. Provider secrets, prompts, and raw image bytes are never included.",
      properties: {
        code: {
          type: "string",
        },
        message: {
          type: "string",
        },
      },
      additionalProperties: true,
    },
    MediaAsset: {
      type: "object",
      required: [
        "id",
        "document_id",
        "mime_type",
        "object_key",
        "caption_status",
        "caption",
        "caption_provider_name",
        "caption_model",
        "caption_prompt_version",
        "caption_model_call_id",
        "caption_cache_hit",
        "caption_attempt_count",
        "caption_error",
        "caption_generated_at",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/MediaAssetId",
        },
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        parsed_content_id: {
          oneOf: [{ $ref: "#/components/schemas/ParsedContentId" }, { type: "null" }],
        },
        mime_type: {
          type: "string",
        },
        object_key: {
          type: "string",
        },
        width: {
          type: ["integer", "null"],
        },
        height: {
          type: ["integer", "null"],
        },
        locator: {
          type: "object",
          description:
            "Source locator for this media asset. Document-origin visual assets include source_format, asset_kind, extraction_method, and format-specific fields such as page_number, slide_number, sheet_name, source_path, source_url, image_index, or relationship_id when available.",
          additionalProperties: true,
        },
        caption_status: {
          $ref: "#/components/schemas/CaptionStatus",
        },
        caption: {
          type: ["string", "null"],
          description: "Generated factual caption when available.",
        },
        caption_provider_name: {
          type: ["string", "null"],
        },
        caption_model: {
          type: ["string", "null"],
        },
        caption_prompt_version: {
          type: ["string", "null"],
        },
        caption_model_call_id: {
          type: ["string", "null"],
          pattern: "^llm_call_[a-zA-Z0-9]+$",
        },
        caption_cache_hit: {
          type: "boolean",
        },
        caption_attempt_count: {
          type: "integer",
          minimum: 0,
        },
        caption_error: {
          oneOf: [{ $ref: "#/components/schemas/MediaAssetCaptionError" }, { type: "null" }],
        },
        caption_generated_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
      },
      additionalProperties: true,
    },
    DocumentProcessingUnit: {
      type: "object",
      required: [
        "id",
        "source_document_id",
        "job_id",
        "stage",
        "unit_type",
        "unit_key",
        "attempt_scope",
        "status",
        "locator",
        "counters",
        "warnings",
        "metadata",
        "retry_eligible",
        "updated_at",
      ],
      properties: {
        id: {
          type: "string",
          pattern: "^dpu_[a-zA-Z0-9]+$",
        },
        source_document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        job_id: {
          $ref: "#/components/schemas/IngestJobId",
        },
        parsed_content_id: {
          oneOf: [{ $ref: "#/components/schemas/ParsedContentId" }, { type: "null" }],
        },
        stage: {
          type: "string",
          enum: ["parsing", "ocr", "media_extraction", "captioning", "parsed_artifact"],
        },
        unit_type: {
          type: "string",
        },
        unit_key: {
          type: "string",
        },
        unit_index: {
          type: ["integer", "null"],
        },
        attempt_scope: {
          type: "string",
        },
        status: {
          type: "string",
          enum: ["pending", "running", "succeeded", "failed", "skipped", "canceled"],
        },
        content_hash: {
          type: ["string", "null"],
        },
        dedupe_key: {
          type: "string",
        },
        object_key: {
          type: ["string", "null"],
        },
        object_refs: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        locator: {
          type: "object",
          additionalProperties: true,
        },
        counters: {
          type: "object",
          additionalProperties: true,
        },
        warnings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        safe_error: {
          oneOf: [{ type: "object", additionalProperties: true }, { type: "null" }],
        },
        metadata: {
          type: "object",
          additionalProperties: true,
        },
        retry_eligible: {
          type: "boolean",
        },
        completed_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
        updated_at: {
          $ref: "#/components/schemas/Timestamp",
        },
      },
      additionalProperties: true,
    },
    ParsedContent: {
      type: "object",
      required: [
        "id",
        "document_id",
        "normalized_markdown_object_key",
        "captioned_markdown_object_key",
        "markdown_preview",
        "markdown_preview_object_key",
        "markdown_preview_truncated",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/ParsedContentId",
        },
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        normalized_markdown_object_key: {
          type: "string",
          description: "Immutable parser-normalized Markdown object key.",
        },
        captioned_markdown_object_key: {
          type: ["string", "null"],
          description:
            "Caption-enriched compile artifact object key. This does not replace normalized Markdown.",
        },
        markdown_preview: {
          type: ["string", "null"],
          description:
            "Read-only preview of the parsed Markdown used by the Admin Console primary viewer.",
        },
        markdown_preview_object_key: {
          type: ["string", "null"],
          description: "Object key used to load the Markdown preview.",
        },
        markdown_preview_truncated: {
          type: "boolean",
          description: "Whether the Markdown preview was truncated for response size safety.",
        },
        markdown_preview_error: {
          type: "string",
          description: "Optional diagnostic when the Markdown preview cannot be loaded.",
        },
        media_assets: {
          type: "array",
          items: {
            $ref: "#/components/schemas/MediaAsset",
          },
        },
        ocr_status: {
          $ref: "#/components/schemas/OcrStatus",
        },
        ocr_blocks: {
          type: "array",
          items: {
            $ref: "#/components/schemas/OcrBlock",
          },
        },
        ocr_warnings: {
          type: "array",
          items: {
            $ref: "#/components/schemas/OcrWarning",
          },
        },
      },
      additionalProperties: true,
    },
    IngestJob: {
      type: "object",
      required: ["id", "status", "stage", "progress"],
      properties: {
        id: {
          $ref: "#/components/schemas/IngestJobId",
        },
        status: {
          type: "string",
          enum: ["queued", "running", "completed", "failed", "canceled"],
        },
        stage: {
          type: "string",
          enum: ["parsing", "ocr", "captioning", "analyzing", "generating", "merging", "indexing"],
        },
        progress: {
          type: "integer",
          description:
            "`100` is reserved for terminal `completed` jobs. Queued, running, failed, and canceled jobs remain below `100`.",
          minimum: 0,
          maximum: 100,
        },
        progress_message: {
          type: "string",
          description:
            "Human-readable current state. Terminal jobs use terminal copy instead of active stage copy.",
        },
        events: {
          type: "array",
          description:
            "Persisted historical job events only. Clients should not infer future stages from this list.",
          items: {
            type: "object",
            required: ["type", "stage", "status", "message", "metadata", "created_at"],
            properties: {
              type: {
                type: "string",
                enum: ["job.queued", "job.running", "job.completed", "job.failed", "job.canceled"],
              },
              stage: {
                type: "string",
                enum: [
                  "parsing",
                  "ocr",
                  "captioning",
                  "analyzing",
                  "generating",
                  "merging",
                  "indexing",
                ],
              },
              status: {
                type: "string",
                enum: ["queued", "running", "completed", "failed", "canceled"],
              },
              message: {
                type: "string",
              },
              metadata: {
                type: "object",
                description:
                  "Safe event metadata. Prompt-configurable stages may include `prompt_template`; model-output stages may include `structured_output_attempt_count`, `structured_output_repair_attempts`, `structured_output_final_status`, and safe validation issue summaries. Raw provider output, secrets, and full prompt text are excluded.",
                additionalProperties: true,
              },
              error: {
                type: ["object", "null"],
                description:
                  "Safe stage error summary. `category` classifies provider and model-output failures such as `output_validation_failed` without exposing raw provider output or secrets.",
                properties: {
                  category: {
                    type: "string",
                  },
                  code: {
                    type: "string",
                  },
                  message: {
                    type: "string",
                  },
                  retryable: {
                    type: "boolean",
                  },
                },
                additionalProperties: true,
              },
              created_at: {
                $ref: "#/components/schemas/Timestamp",
              },
            },
            additionalProperties: true,
          },
        },
        error: {
          type: ["object", "null"],
          description:
            "Safe job error summary for failed jobs. `category` separates provider failures from model output validation failures such as `output_validation_failed`.",
          properties: {
            category: {
              type: "string",
            },
            code: {
              type: "string",
            },
            message: {
              type: "string",
            },
            retryable: {
              type: "boolean",
            },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    BatchIngestJobStatusRequest: {
      type: "object",
      required: ["job_ids"],
      properties: {
        job_ids: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            $ref: "#/components/schemas/IngestJobId",
          },
        },
      },
      additionalProperties: false,
    },
    BatchIngestJobStatusResult: {
      type: "object",
      required: ["index", "job_id", "status"],
      properties: {
        index: {
          type: "integer",
          minimum: 0,
        },
        job_id: {
          $ref: "#/components/schemas/IngestJobId",
        },
        status: {
          type: "string",
          enum: ["resolved", "error"],
        },
        job: {
          $ref: "#/components/schemas/IngestJob",
        },
        error: {
          $ref: "#/components/schemas/ApiError",
        },
      },
      additionalProperties: false,
    },
    BatchIngestJobStatusResponse: {
      type: "object",
      required: ["items", "limits"],
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/components/schemas/BatchIngestJobStatusResult",
          },
        },
        limits: {
          type: "object",
          required: ["max_items"],
          properties: {
            max_items: {
              type: "integer",
              minimum: 1,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    IngestProgressCounts: {
      type: "object",
      required: ["total", "queued", "running", "completed", "failed", "canceled"],
      properties: {
        total: {
          type: "integer",
          minimum: 0,
        },
        queued: {
          type: "integer",
          minimum: 0,
        },
        running: {
          type: "integer",
          minimum: 0,
        },
        completed: {
          type: "integer",
          minimum: 0,
        },
        failed: {
          type: "integer",
          minimum: 0,
        },
        canceled: {
          type: "integer",
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
    IngestProgressStageCounts: {
      type: "object",
      required: [
        "uploading",
        "parsing",
        "ocr",
        "captioning",
        "analyzing",
        "generating",
        "merging",
        "indexing",
      ],
      properties: Object.fromEntries(
        [
          "uploading",
          "parsing",
          "ocr",
          "captioning",
          "analyzing",
          "generating",
          "merging",
          "indexing",
        ].map((stage) => [
          stage,
          {
            type: "integer",
            minimum: 0,
          },
        ]),
      ),
      additionalProperties: false,
    },
    KnowledgeBaseIngestProgress: {
      type: "object",
      required: [
        "knowledge_base_id",
        "overall_progress",
        "retrieve_ready",
        "counts",
        "stage_counts",
        "jobs",
        "links",
      ],
      properties: {
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        overall_progress: {
          type: "integer",
          minimum: 0,
          maximum: 100,
        },
        retrieve_ready: {
          type: "boolean",
        },
        latest_job_created_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
        latest_job_updated_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
        counts: {
          $ref: "#/components/schemas/IngestProgressCounts",
        },
        stage_counts: {
          $ref: "#/components/schemas/IngestProgressStageCounts",
        },
        jobs: {
          type: "array",
          items: {
            $ref: "#/components/schemas/IngestJob",
          },
        },
        links: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ApiNextActionLink",
          },
        },
      },
      additionalProperties: false,
    },
    DocumentUploadResponse: {
      type: "object",
      required: ["document", "job", "resources", "links"],
      properties: {
        document: {
          $ref: "#/components/schemas/SourceDocument",
        },
        job: {
          $ref: "#/components/schemas/IngestJob",
        },
        resources: {
          type: "object",
          required: ["knowledge_base_id", "source_document_id", "job_id"],
          properties: {
            knowledge_base_id: {
              $ref: "#/components/schemas/KnowledgeBaseId",
            },
            source_document_id: {
              $ref: "#/components/schemas/SourceDocumentId",
            },
            job_id: {
              $ref: "#/components/schemas/IngestJobId",
            },
          },
          additionalProperties: false,
        },
        links: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ApiNextActionLink",
          },
        },
      },
      additionalProperties: false,
    },
    UploadSession: {
      type: "object",
      required: [
        "id",
        "knowledge_base_id",
        "document_id",
        "object_key",
        "file_name",
        "display_name",
        "mime_type",
        "size",
        "content_hash",
        "metadata",
        "status",
        "expires_at",
        "created_at",
        "updated_at",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/UploadSessionId",
        },
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        object_key: {
          type: "string",
        },
        file_name: {
          type: "string",
        },
        display_name: {
          type: "string",
        },
        mime_type: {
          type: "string",
        },
        size: {
          type: "integer",
          minimum: 1,
        },
        content_hash: {
          type: ["string", "null"],
          pattern: "^sha256:[a-f0-9]{64}$",
        },
        source_path: {
          type: "string",
        },
        metadata: {
          $ref: "#/components/schemas/CommonMetadata",
        },
        status: {
          type: "string",
          enum: ["created", "finalized", "expired", "canceled"],
        },
        expires_at: {
          $ref: "#/components/schemas/Timestamp",
        },
        created_at: {
          $ref: "#/components/schemas/Timestamp",
        },
        updated_at: {
          $ref: "#/components/schemas/Timestamp",
        },
      },
      additionalProperties: false,
    },
    CreateUploadSessionRequest: {
      type: "object",
      required: ["file_name", "mime_type", "size"],
      properties: {
        file_name: {
          type: "string",
        },
        display_name: {
          type: "string",
        },
        mime_type: {
          type: "string",
        },
        size: {
          type: "integer",
          minimum: 1,
        },
        content_hash: {
          type: "string",
          pattern: "^sha256:[a-f0-9]{64}$",
        },
        source_path: {
          type: "string",
        },
        metadata: {
          $ref: "#/components/schemas/CommonMetadata",
        },
      },
      additionalProperties: false,
    },
    FinalizeUploadSessionRequest: {
      type: "object",
      required: ["content_hash"],
      properties: {
        content_hash: {
          type: "string",
          pattern: "^sha256:[a-f0-9]{64}$",
        },
      },
      additionalProperties: false,
    },
    PresignedUpload: {
      type: "object",
      required: ["url", "method", "headers", "expires_at"],
      properties: {
        url: {
          type: "string",
          format: "uri",
          description:
            "Short-lived object-storage upload URL. Provider credentials are not exposed.",
        },
        method: {
          type: "string",
          enum: ["PUT"],
        },
        headers: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
        },
        expires_at: {
          $ref: "#/components/schemas/Timestamp",
        },
      },
      additionalProperties: false,
    },
    CreateUploadSessionResponse: {
      type: "object",
      required: ["upload_session", "presigned_upload"],
      properties: {
        upload_session: {
          $ref: "#/components/schemas/UploadSession",
        },
        presigned_upload: {
          $ref: "#/components/schemas/PresignedUpload",
        },
      },
      additionalProperties: false,
    },
    SourceRef: {
      type: "object",
      description: "Traceable source evidence attached to a page, graph edge, or result.",
      required: ["document_id", "locator_status", "warning_codes"],
      properties: {
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        parsed_content_id: {
          type: "string",
          description:
            "Parsed Content ID for the source artifact that produced this evidence, when available.",
        },
        source_anchor_id: {
          type: "string",
          description:
            "Deterministic source-backed Wiki anchor identity for the Source Document, when available.",
        },
        locator: {
          type: "string",
        },
        media_asset_id: {
          $ref: "#/components/schemas/MediaAssetId",
        },
        evidence_kind: {
          type: "string",
          enum: ["text", "image_caption", "ocr"],
          description:
            "Identifies whether the source evidence came from native text, OCR text, or a vision caption.",
        },
        locator_status: {
          $ref: "#/components/schemas/SourceEvidenceLocatorStatus",
        },
        warning_codes: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Machine-readable warning codes explaining unresolved, missing, unsupported, or downgraded source locators.",
        },
        visibility_origin: {
          $ref: "#/components/schemas/VisibilityOrigin",
        },
      },
      additionalProperties: true,
    },
    RetrievalDisplayMetadata: {
      type: "object",
      description:
        "Bounded user-facing metadata for interpreting or disambiguating retrieved Wiki results, including safe source, version, date, owner, locale, and configured metadata context where available. Raw internal metadata, secrets, signed URLs, object-storage keys, deployment paths, and unbounded nested objects are excluded.",
      additionalProperties: {
        oneOf: [
          { type: "string" },
          { type: "number" },
          { type: "boolean" },
          {
            type: "array",
            items: { type: "string" },
          },
        ],
      },
    },
    RetrievalMediaEvidence: {
      type: "object",
      required: [
        "document_id",
        "locator_status",
        "warning_codes",
        "media_asset_id",
        "evidence_kind",
        "preview",
      ],
      description:
        "Bounded image-caption evidence linked to a retrieved Wiki result. Use Source Evidence or Media Asset preview APIs to dereference the original document-origin visual asset and structured locator metadata.",
      properties: {
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        locator: {
          type: "string",
          description:
            "Source-ref locator emitted by retrieval, such as `pdf:page:1`, `pptx:slide:2`, or another parser/source locator. Structured source format metadata is preserved on the Media Asset locator.",
        },
        locator_status: {
          $ref: "#/components/schemas/SourceEvidenceLocatorStatus",
        },
        warning_codes: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Machine-readable warning codes explaining unresolved, missing, unsupported, or downgraded media evidence locators.",
        },
        media_asset_id: {
          $ref: "#/components/schemas/MediaAssetId",
        },
        evidence_kind: {
          type: "string",
          enum: ["image_caption"],
        },
        caption: {
          type: "string",
          description:
            "Bounded factual caption generated by the vision caption pipeline. Treat it as image evidence, not exact source text.",
        },
        visibility_origin: {
          $ref: "#/components/schemas/VisibilityOrigin",
        },
        preview: {
          type: "object",
          required: ["available", "endpoint"],
          properties: {
            available: {
              type: "boolean",
            },
            endpoint: {
              type: "string",
              description: "Authenticated preview endpoint for the Media Asset.",
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: true,
    },
    SourceEvidenceKind: {
      type: "string",
      enum: ["text", "image_caption", "ocr"],
      description: "Source evidence surface used for citation dereference.",
    },
    SourceEvidenceLocatorStatus: {
      type: "string",
      enum: ["resolved", "not_provided", "not_found", "ambiguous", "unsupported"],
      description: "`resolved` is required before clients quote text as exact source evidence.",
    },
    SourceEvidenceWarning: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
        },
        message: {
          type: "string",
        },
        details: {
          type: "object",
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
    SourceEvidenceOcrMetadata: {
      type: "object",
      required: ["page_number", "block_index"],
      properties: {
        page_number: {
          type: "integer",
          minimum: 1,
        },
        block_index: {
          type: "integer",
          minimum: 0,
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        bbox: {
          type: "object",
          additionalProperties: true,
        },
        provider: {
          type: "string",
        },
        engine: {
          type: "string",
        },
        artifact_object_key: {
          type: "string",
        },
      },
      additionalProperties: true,
    },
    SourceEvidenceMediaMetadata: {
      type: "object",
      required: ["media_asset_id", "caption_status", "preview"],
      properties: {
        media_asset_id: {
          $ref: "#/components/schemas/MediaAssetId",
        },
        mime_type: {
          type: "string",
        },
        object_key: {
          type: "string",
        },
        locator: {
          type: "object",
          description:
            "Structured document-origin locator. Cross-format visual assets include source_format, asset_kind, extraction_method, and format-specific fields such as page_number, slide_number, sheet_name, source_path, source_url, image_index, or relationship_id when available.",
          additionalProperties: true,
        },
        width: {
          type: ["integer", "null"],
        },
        height: {
          type: ["integer", "null"],
        },
        caption_status: {
          $ref: "#/components/schemas/CaptionStatus",
        },
        preview: {
          type: "object",
          required: ["endpoint"],
          properties: {
            endpoint: {
              type: "string",
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: true,
    },
    SourceEvidenceRequest: {
      type: "object",
      description:
        "Bounded source evidence dereference request. Pass `knowledge_base_id` to enforce the same canonical or fork-visible scope used by Retrieve. `allow_fallback` is false by default so exact quotes are only returned when the locator resolves.",
      properties: {
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
          description:
            "Target canonical Knowledge Base ID or fork ID used to validate document visibility before dereferencing source evidence.",
        },
        locator: {
          type: "string",
          description:
            "A parser locator such as `line:12` or `line:12-14`, a model locator such as `source_markdown`, `source_markdown:12`, or `source_markdown:12-14`, `page:3`, OCR locators such as `ocr:page:3:block:2`, `page:3:2`, `page:3;block:2`, `page=3:block=2`, `page=3; block_index=2`, or `page:3;block:2-5`, a comma-separated text anchor such as `SECTION-101,SECTION-102`, or another source-ref locator from Retrieve.",
        },
        media_asset_id: {
          $ref: "#/components/schemas/MediaAssetId",
        },
        parsed_content_id: {
          $ref: "#/components/schemas/ParsedContentId",
          description:
            "Optional parsed content identity from Retrieve citations. When provided, Source Evidence validates that it belongs to the requested Source Document.",
        },
        source_anchor_id: {
          type: "string",
          description:
            "Optional deterministic source-backed Wiki anchor identity from Retrieve citations. Echoed for citation/source-version disambiguation.",
        },
        evidence_kind: {
          $ref: "#/components/schemas/SourceEvidenceKind",
        },
        max_chars: {
          type: "integer",
          default: 4000,
          minimum: 1,
          maximum: 12000,
        },
        context_chars: {
          type: "integer",
          default: 800,
          minimum: 0,
          maximum: 2000,
        },
        allow_fallback: {
          type: "boolean",
          default: false,
        },
      },
      additionalProperties: false,
    },
    SourceEvidenceResponse: {
      type: "object",
      required: [
        "document_id",
        "parsed_content_id",
        "locator_status",
        "evidence_kind",
        "text",
        "text_truncated",
        "context_before",
        "context_after",
        "context_truncated",
        "content_hash",
        "parser_name",
        "parser_version",
        "source_object_key",
        "warnings",
      ],
      properties: {
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
          description:
            "Canonical Knowledge Base ID or fork ID whose visible source scope was used for this dereference.",
        },
        visibility_origin: {
          $ref: "#/components/schemas/VisibilityOrigin",
        },
        owner_knowledge_base_id: {
          anyOf: [
            {
              $ref: "#/components/schemas/KnowledgeBaseId",
            },
            {
              type: "null",
            },
          ],
        },
        upstream_resource_id: {
          anyOf: [
            {
              $ref: "#/components/schemas/SourceDocumentId",
            },
            {
              type: "null",
            },
          ],
        },
        parsed_content_id: {
          $ref: "#/components/schemas/ParsedContentId",
        },
        source_anchor_id: {
          type: "string",
          description:
            "Deterministic source-backed Wiki anchor identity echoed from the request or Retrieve citation when available.",
        },
        locator: {
          type: "string",
        },
        locator_status: {
          $ref: "#/components/schemas/SourceEvidenceLocatorStatus",
        },
        evidence_kind: {
          $ref: "#/components/schemas/SourceEvidenceKind",
        },
        text: {
          type: "string",
          description:
            "Bounded text excerpt. Treat as an exact quote only when `locator_status` is `resolved`.",
        },
        text_truncated: {
          type: "boolean",
        },
        context_before: {
          type: "string",
        },
        context_after: {
          type: "string",
        },
        context_truncated: {
          type: "boolean",
        },
        content_hash: {
          type: "string",
        },
        parser_name: {
          type: "string",
        },
        parser_version: {
          type: "string",
        },
        normalized_markdown_object_key: {
          type: "string",
        },
        captioned_markdown_object_key: {
          type: "string",
        },
        plain_text_object_key: {
          type: "string",
        },
        source_object_key: {
          type: "string",
        },
        warnings: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceEvidenceWarning",
          },
        },
        ocr_evidence: {
          $ref: "#/components/schemas/SourceEvidenceOcrMetadata",
        },
        media_evidence: {
          $ref: "#/components/schemas/SourceEvidenceMediaMetadata",
        },
      },
      additionalProperties: true,
    },
    SourceEvidenceResolveItem: {
      allOf: [
        {
          type: "object",
          required: ["document_id"],
          properties: {
            document_id: {
              $ref: "#/components/schemas/SourceDocumentId",
            },
          },
          additionalProperties: false,
        },
        {
          $ref: "#/components/schemas/SourceEvidenceRequest",
        },
      ],
    },
    SourceEvidenceBatchRequest: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            $ref: "#/components/schemas/SourceEvidenceResolveItem",
          },
        },
      },
      additionalProperties: false,
    },
    SourceEvidenceBatchItemResult: {
      type: "object",
      required: ["index", "document_id", "status"],
      properties: {
        index: {
          type: "integer",
          minimum: 0,
        },
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        status: {
          type: "string",
          enum: ["resolved", "error"],
        },
        evidence: {
          $ref: "#/components/schemas/SourceEvidenceResponse",
        },
        error: {
          $ref: "#/components/schemas/ApiError",
        },
      },
      additionalProperties: false,
    },
    SourceEvidenceBatchResponse: {
      type: "object",
      required: ["items", "limits", "total_text_chars", "truncated"],
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceEvidenceBatchItemResult",
          },
        },
        limits: {
          type: "object",
          required: ["max_items", "total_output_max_chars"],
          properties: {
            max_items: {
              type: "integer",
              default: 20,
            },
            total_output_max_chars: {
              type: "integer",
              default: 40000,
            },
          },
          additionalProperties: false,
        },
        total_text_chars: {
          type: "integer",
          minimum: 0,
        },
        truncated: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    GraphAlgorithmMetadata: {
      type: "object",
      required: ["name", "version"],
      properties: {
        name: {
          type: "string",
        },
        version: {
          type: "string",
        },
        weights: {
          type: "object",
          additionalProperties: {
            type: "number",
          },
        },
        community_algorithm: {
          type: "object",
          required: ["name", "version", "weighted"],
          properties: {
            name: {
              type: "string",
            },
            version: {
              type: "string",
            },
            weighted: {
              type: "boolean",
            },
            resolution: {
              type: "number",
            },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    GraphSignalContribution: {
      type: "object",
      required: ["type", "weight", "score", "reason_codes"],
      properties: {
        type: {
          type: "string",
          enum: ["wikilink", "shared_source", "common_neighbor", "type_affinity"],
        },
        weight: {
          type: "number",
        },
        score: {
          type: "number",
        },
        reason_codes: {
          type: "array",
          items: {
            type: "string",
          },
        },
        evidence_refs: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      additionalProperties: true,
    },
    GraphInsightItem: {
      type: "object",
      required: ["id", "insight_type"],
      properties: {
        id: {
          type: "string",
        },
        insight_type: {
          type: "string",
          enum: [
            "isolated_page",
            "sparse_page",
            "bridge_page",
            "knowledge_gap",
            "community",
            "surprising_connection",
          ],
        },
        page_id: {
          oneOf: [{ $ref: "#/components/schemas/WikiPageId" }, { type: "null" }],
        },
        page_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/WikiPageId",
          },
        },
        reason_codes: {
          type: "array",
          items: {
            type: "string",
          },
        },
        signal_contributions: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphSignalContribution",
          },
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
      additionalProperties: true,
    },
    GraphInsightSnapshot: {
      type: "object",
      required: ["algorithm", "edge_count", "graph_hash", "node_count"],
      properties: {
        algorithm: {
          $ref: "#/components/schemas/GraphAlgorithmMetadata",
        },
        edge_count: {
          type: "integer",
          minimum: 0,
        },
        graph_hash: {
          type: "string",
        },
        node_count: {
          type: "integer",
          minimum: 0,
        },
      },
      additionalProperties: true,
    },
    WikiPage: {
      type: "object",
      required: [
        "id",
        "knowledge_base_id",
        "slug",
        "title",
        "type",
        "status",
        "markdown",
        "frontmatter",
        "source_document_ids",
        "metadata",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/WikiPageId",
        },
        markdown: {
          type: "string",
          description:
            "Renderable Markdown with frontmatter-compatible metadata, wikilinks, source references, media references, and Markdown extensions.",
        },
        source_refs: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceRef",
          },
        },
        media_refs: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        wikilink_targets: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        visibility_origin: {
          $ref: "#/components/schemas/VisibilityOrigin",
        },
      },
      additionalProperties: true,
    },
    SystemPage: {
      type: "object",
      additionalProperties: true,
      description: "System-maintained Wiki page returned by Knowledge Base system page APIs.",
    },
    RelatedWikiPage: {
      type: "object",
      additionalProperties: true,
      description: "Related Wiki page edge summary.",
    },
    WikiPageVersion: {
      type: "object",
      additionalProperties: true,
      description: "Immutable Wiki page version snapshot.",
    },
    KnowledgeVersion: {
      type: "object",
      additionalProperties: true,
      description: "Immutable Knowledge Base version snapshot.",
    },
    SourceWatchRule: {
      type: "object",
      additionalProperties: true,
      description: "Source Watch rule configuration and schedule status.",
    },
    ScheduledImportJob: {
      type: "object",
      additionalProperties: true,
      description: "Source Watch scan history and import preview record.",
    },
    SourceWatchScanItem: {
      type: "object",
      additionalProperties: true,
      description:
        "Persisted Source Watch staging item for scan details and large-scan pagination.",
      required: ["item_kind", "payload", "source_identity"],
      properties: {
        item_kind: {
          type: "string",
          enum: [
            "discovered",
            "skipped",
            "new",
            "changed",
            "unchanged",
            "delete_candidate",
            "failed",
          ],
        },
        source_identity: {
          type: "string",
        },
        source_path: {
          type: "string",
        },
        source_url: {
          type: "string",
        },
        content_hash: {
          type: "string",
        },
        comparison_status: {
          type: "string",
        },
        cursor: {
          type: "object",
          additionalProperties: true,
        },
        payload: {
          type: "object",
          additionalProperties: true,
        },
        safe_error: {
          type: ["object", "null"],
          additionalProperties: true,
        },
      },
    },
    GraphNode: {
      type: "object",
      required: ["page_id", "title", "type", "source_refs"],
      properties: {
        page_id: {
          $ref: "#/components/schemas/WikiPageId",
        },
        page_version_id: {
          $ref: "#/components/schemas/PageVersionId",
        },
        title: {
          type: "string",
        },
        type: {
          type: "string",
        },
        source_refs: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceRef",
          },
        },
        display_metadata: {
          $ref: "#/components/schemas/RetrievalDisplayMetadata",
        },
        visibility_origin: {
          $ref: "#/components/schemas/VisibilityOrigin",
        },
      },
      additionalProperties: true,
    },
    GraphEdge: {
      type: "object",
      required: [
        "edge_id",
        "from_page_id",
        "to_page_id",
        "relation_type",
        "weight",
        "source_document_ids",
      ],
      properties: {
        edge_id: {
          $ref: "#/components/schemas/GraphEdgeId",
        },
        from_page_id: {
          $ref: "#/components/schemas/WikiPageId",
        },
        to_page_id: {
          $ref: "#/components/schemas/WikiPageId",
        },
        relation_type: {
          type: "string",
        },
        explanation: {
          type: "string",
        },
        source_document_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceDocumentId",
          },
        },
        weight: {
          type: "number",
        },
        algorithm: {
          $ref: "#/components/schemas/GraphAlgorithmMetadata",
        },
        signal_contributions: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphSignalContribution",
          },
        },
        visibility_origin: {
          $ref: "#/components/schemas/VisibilityOrigin",
        },
      },
      additionalProperties: true,
    },
    Graph: {
      type: "object",
      required: ["knowledge_base_id", "nodes", "edges"],
      properties: {
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        graph_readiness: {
          $ref: "#/components/schemas/GraphInsightStatus",
        },
        nodes: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphNode",
          },
        },
        edges: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphEdge",
          },
        },
      },
      additionalProperties: true,
    },
    GraphInsightStatus: {
      type: "object",
      required: ["state", "updated_at", "started_at", "source_job_id", "failure_reason"],
      properties: {
        state: {
          type: "string",
          enum: ["queued", "updating", "partial", "stale", "ready", "failed"],
        },
        updated_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
        started_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
        source_job_id: {
          oneOf: [{ $ref: "#/components/schemas/IngestJobId" }, { type: "null" }],
        },
        failure_reason: {
          type: ["string", "null"],
        },
      },
      additionalProperties: true,
    },
    GraphInsights: {
      type: "object",
      required: [
        "knowledge_base_id",
        "status",
        "isolated_pages",
        "sparse_pages",
        "bridge_pages",
        "knowledge_gaps",
        "communities",
        "surprising_connections",
        "empty_reasons",
        "snapshot",
      ],
      properties: {
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        status: {
          $ref: "#/components/schemas/GraphInsightStatus",
        },
        snapshot: {
          $ref: "#/components/schemas/GraphInsightSnapshot",
        },
        isolated_pages: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphInsightItem",
          },
        },
        sparse_pages: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphInsightItem",
          },
        },
        bridge_pages: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphInsightItem",
          },
        },
        knowledge_gaps: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphInsightItem",
          },
        },
        communities: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphInsightItem",
          },
        },
        surprising_connections: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphInsightItem",
          },
        },
        empty_reasons: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
        },
      },
      additionalProperties: true,
    },
    RetrieveRequest: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "English, Chinese, or mixed-language query. CJK terms are expanded into phrase, bigram, and single-character lexical tokens.",
        },
        mode: {
          type: "string",
          enum: ["hybrid", "keyword", "semantic", "graph"],
        },
        top_k: {
          type: "integer",
          minimum: 1,
        },
        graph_depth: {
          type: "integer",
          minimum: 0,
        },
        graph_limit_per_result: {
          type: "integer",
          minimum: 1,
        },
        include_graph: {
          type: "boolean",
        },
        include_expand_hints: {
          type: "boolean",
        },
        context_budget_tokens: {
          type: "integer",
          minimum: 1,
        },
        include_trace: {
          type: "boolean",
        },
        include_context_pack: {
          type: "boolean",
        },
        min_answer_confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          default: 0.6,
          description:
            "Minimum retrieval-evidence confidence required before Retrieve marks context as answerable.",
        },
        strict_evidence: {
          type: "boolean",
          default: false,
          description:
            "When true, Retrieve requires source-traceable citation evidence before marking context answerable.",
        },
        no_answer_behavior: {
          $ref: "#/components/schemas/RetrieveNoAnswerBehavior",
        },
        include_resolved_evidence: {
          type: "boolean",
          default: false,
          description:
            "When true, Retrieve returns bounded Source Evidence results attached to citation-like references.",
        },
        resolved_evidence: {
          $ref: "#/components/schemas/RetrieveResolvedEvidenceOptions",
        },
        relation_types: {
          type: "array",
          items: {
            type: "string",
          },
        },
        page_types: {
          type: "array",
          items: {
            type: "string",
          },
        },
        source_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceDocumentId",
          },
        },
        version_id: {
          $ref: "#/components/schemas/KnowledgeVersionId",
        },
        graph: {
          type: "object",
          additionalProperties: true,
        },
        context_pack: {
          type: "object",
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    RetrieveNoAnswerBehavior: {
      type: "string",
      enum: ["diagnostic_results", "empty_results"],
      description:
        "Controls whether not-answerable responses keep bounded diagnostic candidates or return empty candidate arrays.",
    },
    RetrieveAnswerabilityThresholds: {
      type: "object",
      required: ["answerable", "partial", "min_citations", "strict_evidence", "no_answer_behavior"],
      properties: {
        answerable: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        partial: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        min_citations: {
          type: "integer",
          minimum: 0,
        },
        strict_evidence: {
          type: "boolean",
        },
        no_answer_behavior: {
          $ref: "#/components/schemas/RetrieveNoAnswerBehavior",
        },
      },
      additionalProperties: false,
    },
    RetrieveAnswerability: {
      type: "object",
      required: [
        "status",
        "confidence",
        "evidence_sufficiency",
        "no_answer",
        "reason_codes",
        "recommended_action",
        "thresholds",
      ],
      properties: {
        status: {
          type: "string",
          enum: ["answerable", "partial", "not_answerable"],
          description:
            "Whether the returned Wiki-centered evidence is sufficient for a source-backed answer.",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Deterministic retrieval-evidence confidence score. This is not a truth probability.",
        },
        evidence_sufficiency: {
          type: "string",
          enum: ["sufficient", "partial", "insufficient"],
        },
        no_answer: {
          type: "boolean",
        },
        reason_codes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "sufficient_evidence",
              "partial_evidence",
              "low_confidence",
              "low_score_margin",
              "insufficient_citations",
              "no_relevant_candidate",
              "over_filtered",
              "index_not_ready",
              "ambiguous_intent",
              "context_pack_diagnostic_only",
              "strict_evidence_required",
            ],
          },
        },
        recommended_action: {
          type: "string",
          enum: [
            "answer_with_citations",
            "answer_with_caveat",
            "ask_clarifying_question",
            "refuse_or_escalate",
            "relax_filters",
            "retry_after_ingest",
          ],
        },
        thresholds: {
          $ref: "#/components/schemas/RetrieveAnswerabilityThresholds",
        },
      },
      additionalProperties: false,
    },
    RetrieveResolvedEvidenceOptions: {
      type: "object",
      properties: {
        allow_fallback: {
          type: "boolean",
          default: false,
        },
        context_chars: {
          type: "integer",
          minimum: 0,
          maximum: 2000,
        },
        max_chars: {
          type: "integer",
          minimum: 1,
          maximum: 12000,
        },
        max_items: {
          type: "integer",
          minimum: 1,
          maximum: 20,
        },
      },
      additionalProperties: false,
    },
    RetrieveResolvedEvidencePayload: {
      type: "object",
      required: ["items", "limits", "total_text_chars", "truncated"],
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceEvidenceBatchItemResult",
          },
        },
        limits: {
          type: "object",
          required: ["max_items", "total_output_max_chars"],
          properties: {
            max_items: {
              type: "integer",
              minimum: 1,
            },
            total_output_max_chars: {
              type: "integer",
              minimum: 0,
            },
          },
          additionalProperties: false,
        },
        total_text_chars: {
          type: "integer",
          minimum: 0,
        },
        truncated: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    RetrieveResponse: {
      type: "object",
      required: [
        "knowledge_base_id",
        "target_knowledge_base_type",
        "visibility_summary",
        "results",
        "graph_expansions",
        "citations",
        "media_evidence",
        "answerability",
      ],
      properties: {
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        target_knowledge_base_type: {
          type: "string",
          enum: ["canonical", "fork"],
        },
        visibility_summary: {
          type: "object",
          required: ["canonical", "upstream_inherited", "fork_owned"],
          properties: {
            canonical: {
              type: "integer",
              minimum: 0,
            },
            upstream_inherited: {
              type: "integer",
              minimum: 0,
            },
            fork_owned: {
              type: "integer",
              minimum: 0,
            },
          },
          additionalProperties: false,
        },
        graph_readiness: {
          $ref: "#/components/schemas/GraphInsightStatus",
        },
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              display_metadata: {
                $ref: "#/components/schemas/RetrievalDisplayMetadata",
              },
            },
            additionalProperties: true,
          },
        },
        graph_expansions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        citations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        media_evidence: {
          type: "array",
          description:
            "Bounded image-caption evidence linked to retrieved results across supported source formats.",
          items: {
            $ref: "#/components/schemas/RetrievalMediaEvidence",
          },
        },
        context_pack: {
          oneOf: [{ $ref: "#/components/schemas/ContextPack" }, { type: "null" }],
        },
        context_budget: {
          $ref: "#/components/schemas/ContextBudget",
        },
        answerability: {
          $ref: "#/components/schemas/RetrieveAnswerability",
        },
        trace: {
          oneOf: [
            {
              type: "object",
              description:
                "Safe retrieval trace metadata. Stage names include query_normalization, keyword_retrieval, metadata_matching, semantic_retrieval, rank_fusion, rerank, graph_expansion, context_budget, context_pruning, citation_selection, answerability, and final_packing when available.",
              additionalProperties: true,
            },
            { type: "null" },
          ],
        },
        warnings: {
          type: "array",
          description:
            "Stable non-fatal warning codes. Index warnings include retrieve.index.semantic_not_ready. Rerank warnings include retrieve.rerank_failed and retrieve.rerank_timed_out; rerank disabled or skipped states are reported through trace metadata.",
          items: {
            type: "string",
          },
        },
        resolved_evidence: {
          $ref: "#/components/schemas/RetrieveResolvedEvidencePayload",
        },
      },
      additionalProperties: true,
    },
    ContextPack: {
      type: "object",
      required: [
        "format",
        "content",
        "entries",
        "budget_tokens",
        "used_tokens",
        "included_page_ids",
      ],
      properties: {
        format: {
          type: "string",
          enum: ["markdown"],
        },
        content: {
          type: "string",
        },
        budget_tokens: {
          type: "integer",
        },
        used_tokens: {
          type: "integer",
        },
        entries: {
          type: "array",
          items: {
            type: "object",
            required: ["section_id", "category", "resource_type", "resource_id"],
            properties: {
              section_id: {
                type: "string",
              },
              category: {
                type: "string",
              },
              resource_type: {
                type: "string",
              },
              resource_id: {
                type: "string",
              },
              page_id: {
                $ref: "#/components/schemas/WikiPageId",
              },
              page_version_id: {
                $ref: "#/components/schemas/PageVersionId",
              },
              visibility_origin: {
                $ref: "#/components/schemas/VisibilityOrigin",
              },
            },
            additionalProperties: true,
          },
        },
        included_page_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/WikiPageId",
          },
        },
        included_page_version_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/PageVersionId",
          },
        },
        included_section_ids: {
          type: "array",
          items: {
            type: "string",
          },
        },
        citations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        media_evidence: {
          type: "array",
          items: {
            $ref: "#/components/schemas/RetrievalMediaEvidence",
          },
        },
        answerability: {
          $ref: "#/components/schemas/RetrieveAnswerability",
        },
      },
      additionalProperties: true,
    },
    ContextBudget: {
      type: ["object", "null"],
      properties: {
        total_tokens_estimated: {
          type: "integer",
          minimum: 0,
        },
        total_budget_tokens: {
          type: "integer",
          minimum: 0,
        },
        used_tokens: {
          type: "integer",
          minimum: 0,
        },
        categories: {
          type: "object",
          additionalProperties: true,
        },
        omitted_items: {
          type: "array",
          items: {
            type: "object",
            required: ["category", "resource_type", "resource_id", "estimated_tokens", "reason"],
            properties: {
              category: {
                type: "string",
                enum: [
                  "system_pages",
                  "direct_hits",
                  "graph_expansions",
                  "citations",
                  "media_evidence",
                  "metadata",
                ],
              },
              resource_type: {
                type: "string",
                enum: ["page", "section", "edge", "citation", "media_asset", "metadata"],
              },
              resource_id: {
                type: "string",
              },
              estimated_tokens: {
                type: "integer",
                minimum: 0,
              },
              reason: {
                type: "string",
                enum: [
                  "budget_exceeded",
                  "budget_exhausted",
                  "duplicate_context",
                  "duplicate_source_noise",
                  "graph_neighbor_after_source_evidence",
                  "lower_source_match",
                  "missing_locator_evidence",
                ],
              },
            },
            additionalProperties: false,
          },
        },
        truncated_categories: {
          type: "array",
          items: {
            type: "string",
          },
        },
        truncated: {
          type: "boolean",
        },
        strategy_version: {
          type: "string",
        },
      },
      additionalProperties: true,
    },
    RetrieveExpandRequest: {
      type: "object",
      required: ["seed_page_ids"],
      properties: {
        seed_page_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/WikiPageId",
          },
        },
        depth: {
          type: "integer",
          minimum: 1,
        },
        seed_edge_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/GraphEdgeId",
          },
        },
        relation_types: {
          type: "array",
          items: {
            type: "string",
          },
        },
        exclude_page_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/WikiPageId",
          },
        },
        include_context_pack: {
          type: "boolean",
        },
        include_resolved_evidence: {
          type: "boolean",
          default: false,
        },
        resolved_evidence: {
          $ref: "#/components/schemas/RetrieveResolvedEvidenceOptions",
        },
        context_budget_tokens: {
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: true,
    },
    RetrieveExpandResponse: {
      type: "object",
      required: [
        "knowledge_base_id",
        "expanded_results",
        "nodes",
        "edges",
        "context_pack_delta",
        "answerability",
        "next_expansion",
      ],
      properties: {
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        expanded_results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              display_metadata: {
                $ref: "#/components/schemas/RetrievalDisplayMetadata",
              },
            },
            additionalProperties: true,
          },
        },
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              display_metadata: {
                $ref: "#/components/schemas/RetrievalDisplayMetadata",
              },
            },
            additionalProperties: true,
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        context_pack_delta: {
          oneOf: [{ $ref: "#/components/schemas/ContextPack" }, { type: "null" }],
        },
        answerability: {
          $ref: "#/components/schemas/RetrieveAnswerability",
        },
        next_expansion: {
          type: "object",
          additionalProperties: true,
        },
        resolved_evidence: {
          $ref: "#/components/schemas/RetrieveResolvedEvidencePayload",
        },
      },
      additionalProperties: true,
    },
    WebhookCreateRequest: {
      type: "object",
      required: ["url", "events"],
      properties: {
        url: {
          type: "string",
          format: "uri",
        },
        events: {
          type: "array",
          items: {
            type: "string",
            enum: webhookEventTypes,
          },
        },
        knowledge_base_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeBaseId" }, { type: "null" }],
        },
        secret: {
          type: "string",
          description:
            "Optional HMAC secret used to generate X-Fococontext-Signature. The secret is never returned.",
        },
      },
      additionalProperties: false,
    },
    WebhookUpdateRequest: {
      type: "object",
      properties: {
        url: {
          type: "string",
          format: "uri",
        },
        events: {
          type: "array",
          items: {
            type: "string",
            enum: webhookEventTypes,
          },
        },
        status: {
          type: "string",
          enum: ["enabled", "disabled"],
        },
        secret: {
          type: ["string", "null"],
          description:
            "Provide a new HMAC secret or null/empty value to clear the subscription secret.",
        },
      },
      additionalProperties: false,
    },
    Webhook: {
      type: "object",
      required: ["id", "url", "events", "status", "secret_configured", "delivery_backend"],
      properties: {
        id: {
          $ref: "#/components/schemas/WebhookId",
        },
        knowledge_base_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeBaseId" }, { type: "null" }],
        },
        url: {
          type: "string",
          format: "uri",
        },
        events: {
          type: "array",
          items: {
            type: "string",
            enum: webhookEventTypes,
          },
        },
        status: {
          type: "string",
          enum: ["enabled", "disabled"],
        },
        secret_configured: {
          type: "boolean",
        },
        delivery_backend: {
          type: "object",
          properties: {
            enabled: {
              type: "boolean",
            },
            reason: {
              type: ["string", "null"],
            },
          },
          additionalProperties: true,
        },
        latest_delivery: {
          oneOf: [{ $ref: "#/components/schemas/WebhookDelivery" }, { type: "null" }],
        },
      },
      additionalProperties: true,
    },
    WebhookDelivery: {
      type: "object",
      required: ["id", "webhook_id", "event_type", "status", "attempt_count", "signing"],
      properties: {
        id: {
          $ref: "#/components/schemas/WebhookDeliveryId",
        },
        webhook_id: {
          $ref: "#/components/schemas/WebhookId",
        },
        event_type: {
          type: "string",
          enum: webhookEventTypes,
        },
        status: {
          type: "string",
          enum: ["queued", "delivered", "failed"],
        },
        attempt_count: {
          type: "integer",
          minimum: 0,
        },
        max_attempts: {
          type: "integer",
          minimum: 1,
        },
        signing: {
          type: "object",
          description:
            "Webhook deliveries use X-Fococontext-Signature, X-Fococontext-Timestamp, X-Fococontext-Delivery-Id, and X-Fococontext-Content-Digest headers.",
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    KnowledgeCheckInput: {
      type: "object",
      properties: {
        checks: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "orphan_pages",
              "broken_wikilinks",
              "missing_pages",
              "missing_sources",
              "duplicate_candidates",
              "contradiction_candidates",
              "sparse_communities",
              "bridge_pages",
              "weak_evidence",
              "missing_context",
              "semantic_consistency",
            ],
          },
        },
        page_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/WikiPageId",
          },
        },
        source_document_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceDocumentId",
          },
        },
      },
      additionalProperties: true,
    },
    KnowledgeCheckFinding: {
      type: "object",
      required: ["type", "severity", "page_id", "message"],
      properties: {
        type: {
          type: "string",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        page_id: {
          oneOf: [{ $ref: "#/components/schemas/WikiPageId" }, { type: "null" }],
        },
        affected_object_ids: {
          type: "array",
          items: {
            $ref: "#/components/schemas/ResourceId",
          },
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        evidence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        source_refs: {
          type: "array",
          items: {
            $ref: "#/components/schemas/SourceRef",
          },
        },
        suggested_action: {
          type: "object",
          additionalProperties: true,
        },
        finding_id: {
          type: "string",
        },
      },
      additionalProperties: true,
    },
    KnowledgeCheckSemanticRun: {
      type: "object",
      required: ["status", "repair_attempts", "findings_count"],
      properties: {
        status: {
          type: "string",
          enum: ["skipped", "completed", "partial", "failed"],
        },
        model_call_id: {
          type: "string",
        },
        provider_name: {
          type: "string",
        },
        model: {
          type: "string",
        },
        prompt_version_id: {
          type: "string",
        },
        output_status: {
          type: "string",
          enum: ["succeeded", "failed"],
        },
        repair_attempts: {
          type: "integer",
          minimum: 0,
        },
        structured_output_attempt_count: {
          type: "integer",
          minimum: 1,
        },
        structured_output_final_status: {
          type: "string",
          enum: ["succeeded", "failed"],
        },
        structured_output_mode: {
          type: "string",
          enum: ["strict_json_schema", "json_object_fallback"],
        },
        structured_output_validation_issues: {
          type: "array",
          items: {
            type: "string",
          },
        },
        findings_count: {
          type: "integer",
          minimum: 0,
        },
        failure_reason: {
          type: "string",
        },
        trace: {
          type: "object",
          additionalProperties: true,
        },
        usage: {
          type: "object",
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    KnowledgeCheck: {
      type: "object",
      required: [
        "check_id",
        "knowledge_base_id",
        "status",
        "progress",
        "checks",
        "page_ids",
        "findings",
        "semantic_run",
        "configuration_snapshot",
      ],
      properties: {
        check_id: {
          $ref: "#/components/schemas/KnowledgeCheckId",
        },
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        findings: {
          type: "array",
          items: {
            $ref: "#/components/schemas/KnowledgeCheckFinding",
          },
        },
        semantic_run: {
          $ref: "#/components/schemas/KnowledgeCheckSemanticRun",
        },
      },
      additionalProperties: true,
    },
    CleanupItemCounts: {
      type: "object",
      required: [
        "total",
        "pending",
        "deleted",
        "skipped",
        "failed",
        "object_keys",
        "database_rows",
      ],
      properties: {
        total: {
          type: "integer",
          minimum: 0,
        },
        pending: {
          type: "integer",
          minimum: 0,
        },
        deleted: {
          type: "integer",
          minimum: 0,
        },
        skipped: {
          type: "integer",
          minimum: 0,
        },
        failed: {
          type: "integer",
          minimum: 0,
        },
        object_keys: {
          type: "integer",
          minimum: 0,
        },
        database_rows: {
          type: "integer",
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
    CleanupPhaseArtifactState: {
      type: "object",
      required: ["status", "total", "residual", "failed"],
      properties: {
        status: {
          type: "string",
          enum: ["pending", "running", "completed", "failed", "canceled", "not_applicable"],
        },
        total: {
          type: "integer",
          minimum: 0,
        },
        residual: {
          type: "integer",
          minimum: 0,
        },
        failed: {
          type: "integer",
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
    CleanupResidualArtifactCounts: {
      type: "object",
      required: ["total", "pending", "failed"],
      properties: {
        total: {
          type: "integer",
          minimum: 0,
        },
        pending: {
          type: "integer",
          minimum: 0,
        },
        failed: {
          type: "integer",
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
    CleanupSettledState: {
      type: "object",
      required: ["is_settled", "phase", "object_storage", "database", "residual_artifacts"],
      properties: {
        is_settled: {
          type: "boolean",
        },
        phase: {
          $ref: "#/components/schemas/CleanupPhase",
        },
        object_storage: {
          $ref: "#/components/schemas/CleanupPhaseArtifactState",
        },
        database: {
          $ref: "#/components/schemas/CleanupPhaseArtifactState",
        },
        residual_artifacts: {
          $ref: "#/components/schemas/CleanupResidualArtifactCounts",
        },
      },
      additionalProperties: false,
    },
    CleanupOperation: {
      type: "object",
      required: [
        "id",
        "target_type",
        "target_id",
        "knowledge_base_id",
        "status",
        "phase",
        "retryable",
        "item_counts",
        "settled_state",
        "created_at",
        "updated_at",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/CleanupOperationId",
        },
        target_type: {
          type: "string",
          enum: [
            "knowledge_base",
            "source_document",
            "source_watch_rule",
            "webhook",
            "import_preview",
            "retrieval_trace",
          ],
        },
        target_id: {
          $ref: "#/components/schemas/ResourceId",
        },
        knowledge_base_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeBaseId" }, { type: "null" }],
        },
        status: {
          $ref: "#/components/schemas/CleanupStatus",
        },
        phase: {
          $ref: "#/components/schemas/CleanupPhase",
        },
        retryable: {
          type: "boolean",
        },
        item_counts: {
          $ref: "#/components/schemas/CleanupItemCounts",
        },
        items: {
          type: "array",
          description:
            "Bounded cleanup item page returned by operation detail and retry responses. Cleanup operation list responses return summaries and item counts without this section.",
          items: {
            $ref: "#/components/schemas/CleanupItemSummary",
          },
        },
        items_pagination: {
          $ref: "#/components/schemas/CleanupItemPagination",
        },
        settled_state: {
          $ref: "#/components/schemas/CleanupSettledState",
        },
        created_at: {
          $ref: "#/components/schemas/Timestamp",
        },
        updated_at: {
          $ref: "#/components/schemas/Timestamp",
        },
      },
      additionalProperties: true,
    },
    CleanupItemPagination: {
      type: "object",
      required: ["page", "page_size", "total", "has_more"],
      properties: {
        page: {
          type: "integer",
          minimum: 1,
        },
        page_size: {
          type: "integer",
          minimum: 1,
          maximum: 500,
        },
        total: {
          type: "integer",
          minimum: 0,
        },
        has_more: {
          type: "boolean",
        },
        next_cursor: {
          oneOf: [{ type: "string" }, { type: "null" }],
          description: "Opaque cursor for the next page when cursor pagination is available.",
        },
      },
      additionalProperties: false,
    },
    CleanupItemSummary: {
      type: "object",
      required: ["id", "operation_id", "item_type", "status", "phase"],
      properties: {
        id: {
          type: "string",
        },
        operation_id: {
          $ref: "#/components/schemas/CleanupOperationId",
        },
        item_type: {
          type: "string",
          enum: ["object", "database_row", "reference", "audit"],
        },
        status: {
          type: "string",
          enum: ["pending", "running", "deleted", "skipped", "failed"],
        },
        phase: {
          $ref: "#/components/schemas/CleanupPhase",
        },
      },
      additionalProperties: true,
    },
    ChangeSet: {
      type: "object",
      required: [
        "id",
        "knowledge_base_id",
        "status",
        "trigger_type",
        "title",
        "description",
        "metadata",
        "created_at",
      ],
      properties: {
        id: {
          $ref: "#/components/schemas/ChangeSetId",
        },
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        base_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
        target_version_id: {
          oneOf: [{ $ref: "#/components/schemas/KnowledgeVersionId" }, { type: "null" }],
        },
        status: {
          type: "string",
        },
        trigger_type: {
          type: "string",
        },
        title: {
          type: "string",
        },
        description: {
          type: ["string", "null"],
        },
        diff: {
          type: "object",
          additionalProperties: true,
        },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        metadata: {
          type: "object",
          additionalProperties: true,
        },
        created_at: {
          $ref: "#/components/schemas/Timestamp",
        },
        applied_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
        discarded_at: {
          oneOf: [{ $ref: "#/components/schemas/Timestamp" }, { type: "null" }],
        },
      },
      additionalProperties: true,
    },
    AsyncDeleteResponse: {
      type: "object",
      required: ["id", "status", "cleanup_operation"],
      properties: {
        id: {
          $ref: "#/components/schemas/ResourceId",
        },
        document_id: {
          $ref: "#/components/schemas/SourceDocumentId",
        },
        knowledge_base_id: {
          $ref: "#/components/schemas/KnowledgeBaseId",
        },
        status: {
          type: "string",
          enum: ["deleted"],
        },
        cleanup_operation: {
          $ref: "#/components/schemas/CleanupOperation",
        },
      },
      additionalProperties: true,
    },
    CleanupRetryResponse: {
      type: "object",
      required: ["cleanup_operation"],
      properties: {
        cleanup_operation: {
          $ref: "#/components/schemas/CleanupOperation",
        },
      },
      additionalProperties: false,
    },
    StaleResourceErrorDetails: {
      type: "object",
      required: ["target_type", "target_id"],
      properties: {
        target_type: {
          type: "string",
          enum: ["knowledge_base", "source_document"],
        },
        target_id: {
          $ref: "#/components/schemas/ResourceId",
        },
        cleanup_operation_id: {
          oneOf: [{ $ref: "#/components/schemas/CleanupOperationId" }, { type: "null" }],
        },
        guidance: {
          type: "string",
        },
      },
      additionalProperties: true,
    },
    Pagination: {
      type: "object",
      required: ["page", "page_size", "total", "has_more"],
      properties: {
        page: {
          type: "integer",
          minimum: 1,
        },
        page_size: {
          type: "integer",
          minimum: 1,
        },
        total: {
          type: "integer",
          minimum: 0,
        },
        has_more: {
          type: "boolean",
        },
        next_cursor: {
          oneOf: [{ type: "string" }, { type: "null" }],
          description:
            "Opaque cursor for the next page on cursor-enabled lists. Omitted or null when no next page is available.",
        },
      },
    },
    ApiError: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
          enum: errorCodeEnum,
        },
        message: {
          type: "string",
          description:
            "Human-readable message localized by `X-Fococontext-Locale` or `Accept-Language` when supported.",
        },
        locale: {
          type: "string",
          enum: ["en-US", "zh-CN"],
        },
        message_key: {
          type: "string",
          description:
            "Optional stable localization key for clients that want to render their own copy.",
        },
        details: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
    SuccessEnvelope: {
      type: "object",
      required: ["data", "request_id"],
      properties: {
        data: true,
        request_id: {
          $ref: "#/components/schemas/RequestId",
        },
      },
    },
    ListEnvelope: {
      type: "object",
      required: ["data", "pagination", "request_id"],
      properties: {
        data: {
          type: "array",
          items: true,
        },
        pagination: {
          $ref: "#/components/schemas/Pagination",
        },
        request_id: {
          $ref: "#/components/schemas/RequestId",
        },
      },
    },
    ErrorEnvelope: {
      type: "object",
      required: ["error", "request_id"],
      properties: {
        error: {
          $ref: "#/components/schemas/ApiError",
        },
        request_id: {
          $ref: "#/components/schemas/RequestId",
        },
      },
    },
  },
} as const;

const openApiPathDefinitions = {
  "/dataset-configuration-presets": {
    get: {
      summary: "List dataset configuration presets",
      description:
        "Returns safe, editable Knowledge Base dataset presets. Provider secrets are never included.",
      operationId: "listDatasetConfigurationPresets",
      responses: {
        "200": listJsonResponse(
          "Dataset configuration presets.",
          "#/components/schemas/DatasetConfigurationPreset",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases": {
    get: {
      summary: "List knowledge bases",
      operationId: "listKnowledgeBases",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Knowledge Bases.", "#/components/schemas/KnowledgeBase"),
      },
    },
    post: {
      summary: "Create a knowledge base",
      operationId: "createKnowledgeBase",
      responses: {
        "201": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}": {
    get: {
      summary: "Get a knowledge base",
      operationId: "getKnowledgeBase",
      responses: {
        "200": standardJsonResponse,
      },
    },
    patch: {
      summary: "Update a knowledge base",
      operationId: "updateKnowledgeBase",
      responses: {
        "200": standardJsonResponse,
      },
    },
    delete: {
      summary: "Delete a knowledge base",
      operationId: "deleteKnowledgeBase",
      responses: {
        "200": jsonResponse(
          "Knowledge Base deletion accepted.",
          "#/components/schemas/AsyncDeleteResponse",
        ),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/forks": {
    get: {
      summary: "List knowledge base forks",
      description:
        "Lists forked Knowledge Bases derived from the selected canonical Knowledge Base.",
      operationId: "listKnowledgeBaseForks",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Forked Knowledge Bases.", "#/components/schemas/KnowledgeBase"),
        ...standardErrorResponses,
      },
    },
    post: {
      summary: "Create a knowledge base fork",
      description:
        "Creates a forked Knowledge Base with explicit external owner metadata. Use resolve for idempotent lookup-or-create behavior.",
      operationId: "createKnowledgeBaseFork",
      requestBody: jsonRequestBody("#/components/schemas/ForkResolveRequest"),
      responses: {
        "200": jsonResponse("Forked Knowledge Base.", "#/components/schemas/ForkResolveResponse"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/forks/resolve": {
    post: {
      summary: "Resolve a knowledge base fork",
      description:
        "Idempotently returns an existing active fork or creates one for the canonical Knowledge Base and external owner.",
      operationId: "resolveKnowledgeBaseFork",
      requestBody: jsonRequestBody("#/components/schemas/ForkResolveRequest"),
      responses: {
        "200": jsonResponse(
          "Resolved forked Knowledge Base.",
          "#/components/schemas/ForkResolveResponse",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/forks/{fork_id}": {
    get: {
      summary: "Get a knowledge base fork",
      operationId: "getKnowledgeBaseFork",
      responses: {
        "200": jsonResponse("Forked Knowledge Base.", "#/components/schemas/KnowledgeBase"),
        ...standardErrorResponses,
      },
    },
    delete: {
      summary: "Delete a knowledge base fork",
      description:
        "Hides the fork and queues cleanup for fork-owned overlay records while preserving upstream canonical resources.",
      operationId: "deleteKnowledgeBaseFork",
      responses: {
        "200": jsonResponse("Fork deletion accepted.", "#/components/schemas/ForkDeleteResponse"),
        ...standardErrorResponses,
      },
    },
  },
  "/forks/{fork_id}/sync": {
    post: {
      summary: "Sync a knowledge base fork",
      description:
        "Synchronizes a fork from its canonical upstream using a fork-owned versioned operation.",
      operationId: "syncKnowledgeBaseFork",
      requestBody: jsonRequestBody("#/components/schemas/ForkSyncRequest"),
      responses: {
        "200": jsonResponse("Fork sync status.", "#/components/schemas/ForkSyncResponse"),
        ...standardErrorResponses,
      },
    },
  },
  "/forks/{fork_id}/submissions": {
    post: {
      summary: "Submit generated knowledge to a fork",
      description:
        "Accepts developer-generated Markdown or text plus evidence metadata and routes it through the normal fork-owned ingest pipeline.",
      operationId: "submitForkKnowledge",
      requestBody: jsonRequestBody("#/components/schemas/CreateForkSubmissionRequest"),
      responses: {
        "201": jsonResponse(
          "Fork-owned submission accepted.",
          "#/components/schemas/ForkSubmissionResponse",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/system-pages": {
    get: {
      summary: "List system pages",
      operationId: "listSystemPages",
      parameters: cursorPaginationParameters,
      responses: {
        "200": listJsonResponse("System pages.", "#/components/schemas/SystemPage"),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/dataset-configuration": {
    get: {
      summary: "Get Knowledge Base dataset configuration",
      description:
        "Returns the active dataset-scoped configuration used by ingest, retrieval, Knowledge Check, and Source Watch policy.",
      operationId: "getDatasetConfiguration",
      responses: {
        "200": jsonResponse(
          "Knowledge Base dataset configuration.",
          "#/components/schemas/DatasetConfiguration",
        ),
        ...standardErrorResponses,
      },
    },
    patch: {
      summary: "Update Knowledge Base dataset configuration",
      description:
        "Updates dataset-scoped behavior for the selected Knowledge Base. Runtime provider secrets remain env-only.",
      operationId: "updateDatasetConfiguration",
      requestBody: jsonRequestBody("#/components/schemas/DatasetConfigurationValues"),
      responses: {
        "200": jsonResponse(
          "Updated Knowledge Base dataset configuration.",
          "#/components/schemas/DatasetConfiguration",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/system-pages/{type}": {
    get: {
      summary: "Get a system page",
      operationId: "getSystemPage",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/markdown-contract/validate": {
    post: {
      summary: "Validate Markdown Contract",
      operationId: "validateMarkdownContract",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/markdown-export": {
    get: {
      summary: "Export Markdown",
      operationId: "exportMarkdown",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/reindex": {
    post: {
      summary: "Rebuild Knowledge Base indexes",
      operationId: "rebuildKnowledgeBaseIndexes",
      responses: {
        "201": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/documents": {
    get: {
      summary: "List source documents",
      operationId: "listSourceDocuments",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Source documents.", "#/components/schemas/SourceDocument"),
      },
    },
    post: {
      summary: "Upload a source document",
      operationId: "uploadSourceDocument",
      responses: {
        "201": jsonResponse(
          "Source Document upload accepted.",
          "#/components/schemas/DocumentUploadResponse",
        ),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/documents/text": {
    post: {
      summary: "Create a text source document",
      operationId: "createTextSourceDocument",
      responses: {
        "201": jsonResponse(
          "Text Source Document accepted.",
          "#/components/schemas/DocumentUploadResponse",
        ),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/documents/url": {
    post: {
      summary: "Create a URL source document",
      operationId: "createUrlSourceDocument",
      responses: {
        "201": jsonResponse(
          "URL Source Document accepted.",
          "#/components/schemas/DocumentUploadResponse",
        ),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/documents/upload-sessions": {
    post: {
      summary: "Create a direct upload session",
      description:
        "Creates a short-lived direct upload session and returns a presigned object-storage PUT URL. Use this path for files above the configured direct-upload threshold.",
      operationId: "createSourceUploadSession",
      requestBody: jsonRequestBody("#/components/schemas/CreateUploadSessionRequest"),
      responses: {
        "201": jsonResponse(
          "Direct upload session created.",
          "#/components/schemas/CreateUploadSessionResponse",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/documents/upload-sessions/{upload_session_id}/finalize": {
    post: {
      summary: "Finalize a direct upload session",
      description:
        "Verifies the uploaded object and creates the Source Document plus initial ingest Job.",
      operationId: "finalizeSourceUploadSession",
      requestBody: jsonRequestBody("#/components/schemas/FinalizeUploadSessionRequest"),
      responses: {
        "201": jsonResponse(
          "Direct upload session finalized.",
          "#/components/schemas/DocumentUploadResponse",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/documents/{document_id}": {
    get: {
      summary: "Get a source document",
      operationId: "getSourceDocument",
      responses: {
        "200": standardJsonResponse,
      },
    },
    delete: {
      summary: "Delete a source document through source lifecycle",
      operationId: "deleteSourceDocument",
      responses: {
        "200": jsonResponse(
          "Source Document deletion accepted.",
          "#/components/schemas/AsyncDeleteResponse",
        ),
      },
    },
  },
  "/documents/{document_id}/parsed-content": {
    get: {
      summary: "Get source document parsed content",
      operationId: "getSourceDocumentParsedContent",
      responses: {
        "200": jsonResponse("Parsed Content detail.", "#/components/schemas/ParsedContent"),
        ...standardErrorResponses,
      },
    },
  },
  "/documents/{document_id}/evidence": {
    get: {
      summary: "Resolve source evidence for a document",
      description:
        "Dereferences a single Retrieve or Retrieve Expand citation into bounded source evidence. Use `locator_status=resolved` before quoting as exact source text.",
      operationId: "getSourceDocumentEvidence",
      parameters: [
        {
          name: "document_id",
          in: "path",
          required: true,
          schema: {
            $ref: "#/components/schemas/SourceDocumentId",
          },
        },
        {
          name: "locator",
          in: "query",
          required: false,
          schema: {
            type: "string",
          },
        },
        {
          name: "knowledge_base_id",
          in: "query",
          required: false,
          description:
            "Target canonical Knowledge Base ID or fork ID. When provided, the source document must be visible in this same scope.",
          schema: {
            $ref: "#/components/schemas/KnowledgeBaseId",
          },
        },
        {
          name: "media_asset_id",
          in: "query",
          required: false,
          schema: {
            $ref: "#/components/schemas/MediaAssetId",
          },
        },
        {
          name: "evidence_kind",
          in: "query",
          required: false,
          schema: {
            $ref: "#/components/schemas/SourceEvidenceKind",
          },
        },
        {
          name: "max_chars",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            default: 4000,
            minimum: 1,
            maximum: 12000,
          },
        },
        {
          name: "context_chars",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            default: 800,
            minimum: 0,
            maximum: 2000,
          },
        },
        {
          name: "allow_fallback",
          in: "query",
          required: false,
          schema: {
            type: "boolean",
            default: false,
          },
        },
      ],
      responses: {
        "200": jsonResponse(
          "Source evidence excerpt.",
          "#/components/schemas/SourceEvidenceResponse",
          {
            data: {
              document_id: "doc_example",
              knowledge_base_id: "kb_example",
              visibility_origin: "upstream_inherited",
              owner_knowledge_base_id: "kb_example",
              upstream_resource_id: "doc_example",
              parsed_content_id: "pc_example",
              locator: "line:12",
              locator_status: "resolved",
              evidence_kind: "text",
              text: "The bounded source quote.",
              text_truncated: false,
              context_before: "Previous source context.",
              context_after: "Following source context.",
              context_truncated: false,
              content_hash:
                "sha256:0000000000000000000000000000000000000000000000000000000000000000",
              parser_name: "fococontext-ts-parser",
              parser_version: "0.1.0",
              normalized_markdown_object_key: "parsed/doc_example/normalized.md",
              source_object_key: "sources/doc_example/source.pdf",
              warnings: [],
            },
            request_id: "req_example",
          },
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/documents/{document_id}/processing-units": {
    get: {
      summary: "List source document processing units",
      description:
        "Returns paginated parser, OCR, media extraction, caption, and parsed artifact processing details for diagnostics and Admin progress views.",
      operationId: "listSourceDocumentProcessingUnits",
      parameters: [
        {
          name: "document_id",
          in: "path",
          required: true,
          schema: {
            $ref: "#/components/schemas/SourceDocumentId",
          },
        },
        {
          name: "job_id",
          in: "query",
          required: false,
          schema: {
            $ref: "#/components/schemas/IngestJobId",
          },
        },
        {
          name: "stage",
          in: "query",
          required: false,
          schema: {
            type: "string",
            enum: ["parsing", "ocr", "media_extraction", "captioning", "parsed_artifact"],
          },
        },
        {
          name: "status",
          in: "query",
          required: false,
          schema: {
            type: "string",
            enum: ["pending", "running", "succeeded", "failed", "skipped", "canceled"],
          },
        },
        {
          name: "page",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            minimum: 1,
          },
        },
        {
          name: "page_size",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            minimum: 1,
            maximum: 100,
          },
        },
      ],
      responses: {
        "200": listJsonResponse(
          "Source document processing units.",
          "#/components/schemas/DocumentProcessingUnit",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/documents/{document_id}/media-assets": {
    get: {
      summary: "List source document media assets",
      description:
        "Lists extracted media assets and caption metadata. Caption fields are additive and safe for developer API use.",
      operationId: "listSourceDocumentMediaAssets",
      responses: {
        "200": listJsonResponse("Source document media assets.", "#/components/schemas/MediaAsset"),
        ...standardErrorResponses,
      },
    },
  },
  "/documents/{document_id}/delete-preview": {
    post: {
      summary: "Preview source deletion impact",
      operationId: "previewSourceDeletionImpact",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/documents/{document_id}/reingest": {
    post: {
      summary: "Re-ingest a source document",
      operationId: "reingestSourceDocument",
      responses: {
        "201": standardJsonResponse,
      },
    },
  },
  "/documents/{document_id}/ocr/retry": {
    post: {
      summary: "Retry or reprocess source document OCR",
      description:
        "Schedules OCR retry or reprocess for eligible PDF pages and returns the durable ingest job.",
      operationId: "retrySourceDocumentOcr",
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/OcrRetryRequest",
            },
          },
        },
      },
      responses: {
        "202": jsonResponse("OCR retry accepted.", "#/components/schemas/IngestJob", {
          data: {
            id: "job_example",
            status: "running",
            stage: "ocr",
            progress: 20,
          },
          request_id: "req_example",
        }),
        ...standardErrorResponses,
      },
    },
  },
  "/jobs/{job_id}": {
    get: {
      summary: "Get ingest job status and compile stage events",
      description:
        "Returns the durable ingest Job. `progress: 100` means terminal completion; running, failed, and canceled jobs stay below `100`. Timeline events are persisted historical events and do not include fabricated future stages.",
      operationId: "getIngestJobStatus",
      responses: {
        "200": jsonResponse("Ingest job status.", "#/components/schemas/IngestJob", {
          data: {
            id: "job_example",
            status: "running",
            stage: "generating",
            progress: 55,
            progress_message: "Generating wiki drafts...",
            events: [
              {
                type: "job.running",
                stage: "generating",
                status: "running",
                message: "Generating wiki drafts...",
                metadata: {
                  analysis_result_id: "analysis_example",
                },
                created_at: "2026-05-21T01:00:00.000Z",
              },
            ],
          },
          request_id: "req_example",
        }),
      },
    },
  },
  "/jobs/batch": {
    post: {
      summary: "Get ingest job status in batch",
      description:
        "Returns one ordered result per requested ingest Job ID. Missing or inaccessible jobs use the same non-enumerating `job_not_found` item error.",
      operationId: "getIngestJobStatuses",
      requestBody: jsonRequestBody("#/components/schemas/BatchIngestJobStatusRequest"),
      responses: {
        "200": jsonResponse(
          "Batch ingest job status.",
          "#/components/schemas/BatchIngestJobStatusResponse",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/jobs/{job_id}/retry": {
    post: {
      summary: "Retry an ingest job",
      operationId: "retryIngestJob",
      responses: {
        "201": standardJsonResponse,
      },
    },
  },
  "/jobs/{job_id}/cancel": {
    post: {
      summary: "Cancel an ingest job",
      operationId: "cancelIngestJob",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/cleanup-operations": {
    get: {
      summary: "List deletion cleanup operations",
      description:
        "Returns asynchronous cleanup operation summaries for visible deletion, object cleanup, database cleanup, and retry status. Operation items are loaded through the detail endpoint with item pagination.",
      operationId: "listCleanupOperations",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse(
          "Deletion cleanup operations.",
          "#/components/schemas/CleanupOperation",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/cleanup-operations/{cleanup_operation_id}": {
    get: {
      summary: "Get deletion cleanup operation",
      description:
        "Returns cleanup phase, item counts, a bounded cleanup item page, retry eligibility, and safe error summaries without provider secrets.",
      operationId: "getCleanupOperation",
      parameters: [
        { $ref: "#/components/parameters/CleanupItemsPage" },
        { $ref: "#/components/parameters/CleanupItemsPageSize" },
      ],
      responses: {
        "200": jsonResponse("Deletion cleanup operation.", "#/components/schemas/CleanupOperation"),
        ...standardErrorResponses,
      },
    },
  },
  "/cleanup-operations/{cleanup_operation_id}/retry": {
    post: {
      summary: "Retry deletion cleanup operation",
      description:
        "Queues retry work for retryable failed or pending cleanup items and returns the operation with a bounded cleanup item page.",
      operationId: "retryCleanupOperation",
      parameters: [
        { $ref: "#/components/parameters/CleanupItemsPage" },
        { $ref: "#/components/parameters/CleanupItemsPageSize" },
      ],
      responses: {
        "200": jsonResponse(
          "Deletion cleanup retry accepted.",
          "#/components/schemas/CleanupRetryResponse",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/media-assets/{media_asset_id}/caption/retry": {
    post: {
      summary: "Retry media asset caption",
      description:
        "Retries a failed media asset caption through the server-side `media.caption` queue and returns the durable ingest job. Use `Authorization: Bearer <FOCOCONTEXT_API_KEY>`.",
      operationId: "retryMediaAssetCaption",
      responses: {
        "202": jsonResponse("Caption retry accepted.", "#/components/schemas/IngestJob", {
          data: {
            id: "job_example",
            status: "running",
            stage: "captioning",
            progress: 35,
          },
          request_id: "req_example",
        }),
        ...standardErrorResponses,
      },
    },
  },
  "/media-assets/{media_asset_id}/preview": {
    get: {
      summary: "Get media asset preview metadata",
      operationId: "getMediaAssetPreview",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/imports": {
    post: {
      summary: "Create a batch import",
      operationId: "createBatchImport",
      responses: {
        "202": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/imports/{import_job_id}": {
    get: {
      summary: "Get batch import status",
      description:
        "Returns durable batch import aggregate status and paginated item states for retry and progress polling.",
      operationId: "getBatchImportStatus",
      parameters: [
        {
          name: "knowledge_base_id",
          in: "path",
          required: true,
          schema: {
            $ref: "#/components/schemas/KnowledgeBaseId",
          },
        },
        {
          name: "import_job_id",
          in: "path",
          required: true,
          schema: {
            $ref: "#/components/schemas/JobId",
          },
        },
        ...paginationParameters,
      ],
      responses: {
        "200": standardJsonResponse,
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/jobs": {
    get: {
      summary: "List Knowledge Base jobs with compile stage events",
      description:
        "Returns user-facing Knowledge Base jobs. Internal Graph Insights refresh records are excluded from this list and remain observable through Graph Insights status endpoints.",
      operationId: "listKnowledgeBaseJobs",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Knowledge Base jobs.", "#/components/schemas/IngestJob"),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/ingest-progress": {
    get: {
      summary: "Get Knowledge Base ingest progress",
      description:
        "Returns aggregate ingest job counts, stage counts, representative jobs, and Retrieve readiness metadata for the selected Knowledge Base.",
      operationId: "getKnowledgeBaseIngestProgress",
      responses: {
        "200": jsonResponse(
          "Knowledge Base ingest progress.",
          "#/components/schemas/KnowledgeBaseIngestProgress",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/retrieve": {
    post: {
      summary: "Retrieve wiki-based knowledge context",
      description:
        "Retrieves Wiki Page-centered context with citations, graph-expanded items, context pack data, and optional trace metadata. Use a canonical Knowledge Base ID for shared knowledge retrieval, or a fork ID for upstream inherited plus fork-owned overlay retrieval.",
      operationId: "retrieveKnowledgeContext",
      parameters: [
        {
          name: "knowledge_base_id",
          in: "path",
          required: true,
          description:
            "Target canonical Knowledge Base ID or fork ID. Canonical IDs retrieve shared canonical records; fork IDs retrieve the visible fork scope.",
          schema: {
            $ref: "#/components/schemas/KnowledgeBaseId",
          },
        },
      ],
      requestBody: jsonRequestBody("#/components/schemas/RetrieveRequest", {
        context_budget_tokens: 4000,
        graph_depth: 1,
        include_context_pack: true,
        include_expand_hints: true,
        include_graph: true,
        include_trace: true,
        mode: "hybrid",
        query: "中文 graph context",
        top_k: 10,
      }),
      responses: {
        "200": jsonResponse("Retrieve result.", "#/components/schemas/RetrieveResponse"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/retrieve/expand": {
    post: {
      summary: "Expand retrieved wiki graph context",
      description:
        "Expands from seed Wiki Pages into graph-linked context while preserving relation reasons and source traceability. Uses the same canonical or fork target scope as Retrieve for the given Knowledge Base ID.",
      operationId: "expandRetrievedGraphContext",
      parameters: [
        {
          name: "knowledge_base_id",
          in: "path",
          required: true,
          description:
            "Target canonical Knowledge Base ID or fork ID. Expansion preserves the same visible scope as Retrieve.",
          schema: {
            $ref: "#/components/schemas/KnowledgeBaseId",
          },
        },
      ],
      requestBody: jsonRequestBody("#/components/schemas/RetrieveExpandRequest", {
        context_budget_tokens: 2000,
        depth: 1,
        include_context_pack: true,
        seed_page_ids: ["page_example"],
      }),
      responses: {
        "200": jsonResponse(
          "Retrieve graph expansion result.",
          "#/components/schemas/RetrieveExpandResponse",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/source-evidence/resolve": {
    post: {
      summary: "Resolve source evidence in batch",
      description:
        "Resolves ordered bounded source evidence items from Retrieve and Retrieve Expand citations. Items preserve order and return item-level errors so Agent and MCP backends can expose Retrieve, Expand, and Source Evidence as separate tools.",
      operationId: "resolveSourceEvidence",
      requestBody: jsonRequestBody("#/components/schemas/SourceEvidenceBatchRequest", {
        items: [
          {
            knowledge_base_id: "kb_example",
            document_id: "doc_example",
            evidence_kind: "text",
            locator: "line:12",
            max_chars: 4000,
            context_chars: 800,
            allow_fallback: false,
          },
          {
            knowledge_base_id: "kb_example",
            document_id: "doc_visual",
            evidence_kind: "image_caption",
            media_asset_id: "med_visual",
          },
        ],
      }),
      responses: {
        "200": jsonResponse(
          "Ordered source evidence resolution results.",
          "#/components/schemas/SourceEvidenceBatchResponse",
          {
            data: {
              items: [
                {
                  index: 0,
                  document_id: "doc_example",
                  status: "resolved",
                  evidence: {
                    document_id: "doc_example",
                    knowledge_base_id: "kb_example",
                    visibility_origin: "upstream_inherited",
                    owner_knowledge_base_id: "kb_example",
                    upstream_resource_id: "doc_example",
                    parsed_content_id: "pc_example",
                    source_anchor_id: "src_anchor_doc_example",
                    locator: "line:12",
                    locator_status: "resolved",
                    evidence_kind: "text",
                    text: "The bounded source quote.",
                    text_truncated: false,
                    context_before: "Previous source context.",
                    context_after: "Following source context.",
                    context_truncated: false,
                    content_hash:
                      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
                    parser_name: "fococontext-ts-parser",
                    parser_version: "0.1.0",
                    source_object_key: "sources/doc_example/source.pdf",
                    warnings: [],
                  },
                },
                {
                  index: 1,
                  document_id: "doc_visual",
                  status: "resolved",
                  evidence: {
                    document_id: "doc_visual",
                    knowledge_base_id: "kb_example",
                    parsed_content_id: "pc_visual",
                    source_anchor_id: "src_anchor_doc_visual",
                    locator_status: "resolved",
                    evidence_kind: "image_caption",
                    text: "A chart showing the policy approval workflow.",
                    text_truncated: false,
                    context_before: "",
                    context_after: "",
                    context_truncated: false,
                    content_hash:
                      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
                    parser_name: "ts-pdf-parse",
                    parser_version: "0.1.0",
                    source_object_key: "sources/doc_visual/source.pdf",
                    warnings: [],
                    media_evidence: {
                      media_asset_id: "med_visual",
                      mime_type: "image/png",
                      object_key: "media/doc_visual/page-1.png",
                      locator: {
                        source_format: "pdf",
                        asset_kind: "page_snapshot",
                        extraction_method: "pdf_page_snapshot",
                        page_number: 1,
                      },
                      width: 1024,
                      height: 768,
                      caption_status: "generated",
                      preview: {
                        endpoint: "/v1/media-assets/med_visual/preview",
                      },
                    },
                  },
                },
              ],
              limits: {
                max_items: 20,
                total_output_max_chars: 40000,
              },
              total_text_chars: 25,
              truncated: false,
            },
            request_id: "req_example",
          },
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/graph": {
    get: {
      summary: "Get knowledge graph",
      description:
        "Returns graph nodes and edges derived from Wiki links, generated relationships, shared sources, common neighbors, type affinity, and evidence relationships.",
      operationId: "getKnowledgeGraph",
      responses: {
        "200": jsonResponse("Knowledge graph.", "#/components/schemas/Graph"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/graph/insights": {
    get: {
      summary: "Get graph insights",
      description:
        "Returns graph insight status plus isolated pages, sparse pages, bridge pages, communities, knowledge gaps, surprising connections, and explicit empty reasons.",
      operationId: "getGraphInsights",
      responses: {
        "200": jsonResponse("Graph insights.", "#/components/schemas/GraphInsights"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/graph/insights/refresh": {
    post: {
      summary: "Refresh graph insights",
      description:
        "Queues graph insight recomputation for the current Knowledge Base version and returns the durable hidden ingest job. Poll the graph insights endpoint for refresh status.",
      operationId: "refreshGraphInsights",
      responses: {
        "202": jsonResponse("Graph insight refresh queued.", "#/components/schemas/IngestJob"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/pages": {
    get: {
      summary: "List wiki pages",
      operationId: "listWikiPages",
      parameters: cursorPaginationParameters,
      responses: {
        "200": listJsonResponse("Wiki pages.", "#/components/schemas/WikiPage"),
      },
    },
  },
  "/pages/{page_id}": {
    get: {
      summary: "Get a wiki page",
      operationId: "getWikiPage",
      responses: {
        "200": jsonResponse("Wiki page detail.", "#/components/schemas/WikiPage"),
      },
    },
    patch: {
      summary: "Update a wiki page",
      operationId: "updateWikiPage",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/pages/{page_id}/related": {
    get: {
      summary: "List related wiki pages",
      operationId: "listRelatedWikiPages",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Related wiki pages.", "#/components/schemas/RelatedWikiPage"),
      },
    },
  },
  "/pages/{page_id}/versions": {
    get: {
      summary: "List wiki page versions",
      operationId: "listWikiPageVersions",
      parameters: cursorPaginationParameters,
      responses: {
        "200": listJsonResponse("Wiki page versions.", "#/components/schemas/WikiPageVersion"),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/page-versions": {
    get: {
      summary: "List knowledge base page versions",
      operationId: "listKnowledgeBasePageVersions",
      parameters: cursorPaginationParameters,
      responses: {
        "200": listJsonResponse(
          "Knowledge Base-scoped wiki page versions.",
          "#/components/schemas/WikiPageVersion",
        ),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/source-watch-rules": {
    get: {
      summary: "List source watch rules",
      operationId: "listSourceWatchRules",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Source Watch rules.", "#/components/schemas/SourceWatchRule"),
      },
    },
    post: {
      summary: "Create a source watch rule",
      operationId: "createSourceWatchRule",
      responses: {
        "201": standardJsonResponse,
      },
    },
  },
  "/source-watch-rules/{rule_id}": {
    get: {
      summary: "Get source watch rule status",
      operationId: "getSourceWatchRuleStatus",
      responses: {
        "200": standardJsonResponse,
      },
    },
    patch: {
      summary: "Update a source watch rule",
      operationId: "updateSourceWatchRule",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/source-watch-rules/{rule_id}/scan": {
    post: {
      summary: "Scan a source watch rule",
      operationId: "scanSourceWatchRule",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/source-watch-rules/{rule_id}/disable": {
    post: {
      summary: "Disable a source watch rule",
      operationId: "disableSourceWatchRule",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/source-watch-rules/{rule_id}/enable": {
    post: {
      summary: "Enable a source watch rule",
      operationId: "enableSourceWatchRule",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/source-watch-rules/{rule_id}/scans": {
    get: {
      summary: "List source watch scan history",
      operationId: "listSourceWatchScanHistory",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse(
          "Source Watch scan history.",
          "#/components/schemas/ScheduledImportJob",
        ),
      },
    },
  },
  "/scheduled-import-jobs/{scheduled_import_job_id}": {
    get: {
      summary: "Get scheduled import job",
      operationId: "getScheduledImportJob",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/scheduled-import-jobs/{scheduled_import_job_id}/items": {
    get: {
      summary: "List scheduled import job scan items",
      description:
        "Returns persisted Source Watch scan staging items with pagination for large discovery and comparison runs.",
      operationId: "listScheduledImportJobScanItems",
      parameters: [
        ...paginationParameters,
        {
          name: "item_kind",
          in: "query",
          required: false,
          description: "Optional Source Watch staging item kind filter.",
          schema: {
            type: "string",
            enum: [
              "discovered",
              "skipped",
              "new",
              "changed",
              "unchanged",
              "delete_candidate",
              "failed",
            ],
          },
        },
      ],
      responses: {
        "200": listJsonResponse(
          "Source Watch scan staging items.",
          "#/components/schemas/SourceWatchScanItem",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/knowledge-checks": {
    post: {
      summary: "Create a knowledge check",
      description:
        "Runs dataset-configured quality checks across the dataset, selected pages, source-document scope, or graph-oriented page relationships, then records non-blocking findings.",
      operationId: "createKnowledgeCheck",
      requestBody: jsonRequestBody("#/components/schemas/KnowledgeCheckInput", {
        checks: ["missing_sources", "broken_wikilinks"],
        source_document_ids: ["doc_example"],
      }),
      responses: {
        "201": jsonResponse("Created Knowledge Check.", "#/components/schemas/KnowledgeCheck"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-checks/{check_id}": {
    get: {
      summary: "Get a knowledge check",
      description:
        "Returns a completed or running Knowledge Check with configuration snapshot and findings.",
      operationId: "getKnowledgeCheck",
      responses: {
        "200": jsonResponse("Knowledge Check detail.", "#/components/schemas/KnowledgeCheck"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-checks/{check_id}/findings": {
    get: {
      summary: "List knowledge check findings",
      description:
        "Returns persisted Knowledge Check findings through stable pagination while the Knowledge Check detail response keeps a bounded preview.",
      operationId: "listKnowledgeCheckFindings",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse(
          "Knowledge Check findings.",
          "#/components/schemas/KnowledgeCheckFinding",
        ),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/versions": {
    get: {
      summary: "List knowledge base versions",
      operationId: "listKnowledgeBaseVersions",
      parameters: cursorPaginationParameters,
      responses: {
        "200": listJsonResponse(
          "Knowledge Base versions.",
          "#/components/schemas/KnowledgeVersion",
        ),
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/change-sets": {
    get: {
      summary: "List knowledge base change sets",
      description:
        "Returns Knowledge Base-scoped Change Set summaries with stable ordering and standard pagination. Use the Change Set detail endpoint for full diff and item payloads.",
      operationId: "listKnowledgeBaseChangeSets",
      parameters: cursorPaginationParameters,
      responses: {
        "200": listJsonResponse("Knowledge Base Change Sets.", "#/components/schemas/ChangeSet"),
        ...standardErrorResponses,
      },
    },
  },
  "/change-sets/{change_set_id}": {
    get: {
      summary: "Get a change set",
      operationId: "getChangeSet",
      responses: {
        "200": jsonResponse("Change Set detail.", "#/components/schemas/ChangeSet"),
      },
    },
  },
  "/change-sets/{change_set_id}/apply": {
    post: {
      summary: "Apply a change set",
      operationId: "applyChangeSet",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/change-sets/{change_set_id}/discard": {
    post: {
      summary: "Discard a change set",
      operationId: "discardChangeSet",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/rollback": {
    post: {
      summary: "Roll back a knowledge base",
      operationId: "rollbackKnowledgeBase",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/pages/{page_id}/rollback": {
    post: {
      summary: "Roll back a wiki page",
      operationId: "rollbackWikiPage",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/webhooks": {
    get: {
      summary: "List webhooks",
      description:
        "Lists webhook subscriptions with delivery readiness and latest delivery summary. Secrets are never returned.",
      operationId: "listWebhooks",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Webhook subscriptions.", "#/components/schemas/Webhook"),
        ...standardErrorResponses,
      },
    },
    post: {
      summary: "Create a webhook",
      description:
        "Creates an enabled webhook when delivery runtime is configured. Delivery requests are signed with HMAC SHA-256 when a secret is provided.",
      operationId: "createWebhook",
      requestBody: jsonRequestBody("#/components/schemas/WebhookCreateRequest", {
        events: ["webhook.test", "document.ingest.completed"],
        knowledge_base_id: null,
        secret: "replace-with-shared-secret",
        url: "https://example.com/fococontext/webhook",
      }),
      responses: {
        "201": jsonResponse("Webhook created.", "#/components/schemas/Webhook"),
        ...standardErrorResponses,
      },
    },
  },
  "/webhooks/{webhook_id}": {
    get: {
      summary: "Get a webhook",
      operationId: "getWebhook",
      responses: {
        "200": jsonResponse("Webhook detail.", "#/components/schemas/Webhook"),
        ...standardErrorResponses,
      },
    },
    patch: {
      summary: "Update a webhook",
      operationId: "updateWebhook",
      requestBody: jsonRequestBody("#/components/schemas/WebhookUpdateRequest", {
        events: ["document.ingest.completed", "document.ingest.failed"],
        status: "enabled",
      }),
      responses: {
        "200": jsonResponse("Webhook updated.", "#/components/schemas/Webhook"),
        ...standardErrorResponses,
      },
    },
  },
  "/webhooks/{webhook_id}/test": {
    post: {
      summary: "Send a webhook test event",
      operationId: "sendWebhookTestEvent",
      responses: {
        "202": jsonResponse("Webhook delivery queued.", "#/components/schemas/WebhookDelivery"),
        ...standardErrorResponses,
      },
    },
  },
  "/webhooks/{webhook_id}/deliveries": {
    get: {
      summary: "List webhook deliveries",
      operationId: "listWebhookDeliveries",
      parameters: paginationParameters,
      responses: {
        "200": listJsonResponse("Webhook deliveries.", "#/components/schemas/WebhookDelivery"),
        ...standardErrorResponses,
      },
    },
  },
  "/knowledge-bases/{knowledge_base_id}/wiki-drafts": {
    post: {
      summary: "Submit a wiki draft",
      operationId: "submitWikiDraft",
      responses: {
        "200": standardJsonResponse,
      },
    },
  },
  "/api-keys": {
    post: {
      summary: "Create an API key (V0.2 boundary)",
      operationId: "createApiKeyBoundary",
      responses: {
        "400": {
          description: "API key management is a typed V0.2 boundary in V0.1.",
        },
      },
    },
  },
} as const;

type OpenApiHttpMethod = "delete" | "get" | "patch" | "post" | "put";

export interface OpenApiSecurityMetadata {
  auditClass: string;
  authMode: "bearer_api_key";
  permission: string;
  rateLimitClass: string;
  redactionClass: string;
  tier: "developer-api";
}

type OpenApiOperationLike = {
  operationId: string;
  [key: string]: unknown;
};

type OpenApiPathDefinitions = Record<
  string,
  Partial<Record<OpenApiHttpMethod, OpenApiOperationLike>>
>;

type SecuredOpenApiPaths<T extends OpenApiPathDefinitions> = {
  readonly [Path in keyof T]: {
    readonly [Method in keyof T[Path]]: T[Path][Method] extends OpenApiOperationLike
      ? T[Path][Method] & {
          readonly security: readonly [{ readonly bearerAuth: readonly [] }];
          readonly "x-fococontext-security": OpenApiSecurityMetadata;
        }
      : T[Path][Method];
  };
};

export const openApiPaths = withOpenApiSecurityMetadata(openApiPathDefinitions);

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "FocoContext Knowledge OpenAPI",
    version: "0.1.0",
    description:
      "Developer API for self-hosted Wiki-first knowledge ingestion, graph retrieval, versioning, and retrieval workflows. Protected `/v1` resource calls require an explicit scoped Bearer API key. The machine-readable `/openapi.json` route requires Admin documentation access or an API key with `openapi:read`; anonymous access is rejected. Human-readable messages support `X-Fococontext-Locale` and `Accept-Language`; machine-readable codes, IDs, enum values, and schema fields remain stable.",
  },
  externalDocs: {
    description: "Developer quickstart and Admin Help documentation",
    url: "https://github.com/fococontext/fococontext",
  },
  servers: [
    {
      url: "http://localhost:18080/v1",
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
  components: openApiComponents,
  paths: openApiPaths,
  tags: [
    {
      name: "Knowledge Bases",
      description: "Dataset configuration and Knowledge Base lifecycle.",
    },
    {
      name: "Sources",
      description: "Source documents, Source Watch, ingest jobs, and parsed content.",
    },
    {
      name: "Wiki",
      description: "Wiki Pages, system pages, versions, Change Sets, and rollback.",
    },
    {
      name: "Graph And Retrieve",
      description: "Graph View, Graph Insights, Retrieve, and Retrieve Expand.",
    },
    {
      name: "Governance",
      description: "Knowledge Checks, Change Sets, versions, and evidence-backed findings.",
    },
  ],
} as const;

function withOpenApiSecurityMetadata<T extends OpenApiPathDefinitions>(
  paths: T,
): SecuredOpenApiPaths<T> {
  const securedEntries = Object.entries(paths).map(([path, pathItem]) => [
    path,
    Object.fromEntries(
      Object.entries(pathItem).map(([method, operation]) => {
        if (operation === undefined) {
          return [method, operation];
        }

        const normalizedMethod = method as OpenApiHttpMethod;
        const security = classifyOpenApiOperation(normalizedMethod, path);

        return [
          method,
          {
            ...operation,
            security: [{ bearerAuth: [] }],
            "x-fococontext-security": security,
          },
        ];
      }),
    ),
  ]);

  return Object.fromEntries(securedEntries) as SecuredOpenApiPaths<T>;
}

function classifyOpenApiOperation(
  method: OpenApiHttpMethod,
  path: string,
): OpenApiSecurityMetadata {
  const access = method === "get" ? "read" : "write";

  if (path === "/dataset-configuration-presets") {
    return developerApiSecurity("dataset_configuration:read", "standard_read", "standard", "read");
  }
  if (path === "/api-keys") {
    return developerApiSecurity("api_keys:write", "admin_mutation", "secret_masked", "security");
  }
  if (path.includes("/retrieve")) {
    return developerApiSecurity("retrieve:read", "retrieve", "source_evidence", "read");
  }
  if (path.startsWith("/source-evidence")) {
    return developerApiSecurity("documents:read", "source_evidence", "source_evidence", "read");
  }
  if (path.includes("/upload-sessions")) {
    return developerApiSecurity("documents:write", "upload_session", "storage_scoped", "write");
  }
  if (path.startsWith("/documents") || path.includes("/documents")) {
    return developerApiSecurity(`documents:${access}`, "document", "source_scoped", access);
  }
  if (path.startsWith("/media-assets")) {
    return developerApiSecurity(`documents:${access}`, "media_preview", "source_scoped", access);
  }
  if (path.startsWith("/jobs") || path.includes("/jobs")) {
    return developerApiSecurity(
      path === "/jobs/batch" ? "jobs:read" : method === "post" ? "jobs:write" : "jobs:read",
      "job",
      "standard",
      access,
    );
  }
  if (path.includes("/graph")) {
    return developerApiSecurity("graph:read", "graph", "standard", "read");
  }
  if (path.includes("/source-watch-rules") || path.includes("/scheduled-import-jobs")) {
    return developerApiSecurity(`source_watch:${access}`, "source_watch", "source_scoped", access);
  }
  if (path.startsWith("/webhooks")) {
    return developerApiSecurity(`webhooks:${access}`, "webhook", "secret_masked", access);
  }
  if (path.startsWith("/cleanup-operations")) {
    return developerApiSecurity(`cleanup:${access}`, "cleanup", "source_scoped", access);
  }
  if (path.includes("/imports")) {
    return developerApiSecurity(`imports:${access}`, "import", "source_scoped", access);
  }
  if (path.includes("/knowledge-checks")) {
    return developerApiSecurity(
      `knowledge_checks:${access}`,
      "knowledge_check",
      "standard",
      access,
    );
  }
  if (
    path.includes("/wiki-drafts") ||
    path.includes("/pages") ||
    path.includes("/versions") ||
    path.includes("/change-sets") ||
    path.includes("/rollback")
  ) {
    return developerApiSecurity(`wiki:${access}`, "wiki", "source_scoped", access);
  }
  if (path.startsWith("/forks") || path.includes("/forks")) {
    return developerApiSecurity(`forks:${access}`, "fork", "standard", access);
  }
  if (path.startsWith("/knowledge-bases")) {
    return developerApiSecurity(`knowledge_bases:${access}`, "knowledge_base", "standard", access);
  }

  throw new Error(`Unclassified OpenAPI route security metadata: ${method.toUpperCase()} ${path}`);
}

function developerApiSecurity(
  permission: string,
  rateLimitClass: string,
  redactionClass: string,
  auditClass: string,
): OpenApiSecurityMetadata {
  return {
    auditClass,
    authMode: "bearer_api_key",
    permission,
    rateLimitClass,
    redactionClass,
    tier: "developer-api",
  };
}
