# Errors and Limits

> Errors are localized for humans and stable for programs. Runtime limits are env-first and protect uploads, parsing, OCR, captioning, retrieval, Source Watch, Webhooks, and cleanup.
> Runtime health and settings payloads also expose provider-neutral S3-compatible operation pressure. Class A covers write/list/multipart/control-plane style operations; Class B covers object reads and metadata reads. Exact prices and billing names depend on the configured provider.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page to handle structured errors, limits, cleanup operations, request IDs, and localized messages in production integrations.

## When to Use This Page

- Handle errors by `error.code`, not `error.message`.
- Log `request_id` and resource IDs for support and retry workflows.
- Expose limit errors to operators with the relevant configuration name when possible.
- Treat cleanup as complete only when `settled_state.is_settled` is true.

## Endpoint Matrix

| Method | Path                                                  | Summary                          | operationId           |
| ------ | ----------------------------------------------------- | -------------------------------- | --------------------- |
| `GET`  | `/v1/cleanup-operations`                              | List deletion cleanup operations | listCleanupOperations |
| `GET`  | `/v1/cleanup-operations/{cleanup_operation_id}`       | Get deletion cleanup operation   | getCleanupOperation   |
| `POST` | `/v1/cleanup-operations/{cleanup_operation_id}/retry` | Retry deletion cleanup operation | retryCleanupOperation |

## Field Guide

| Field                                           | Meaning                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `error.code`                                    | Stable enum for client logic.                                                                                   |
| `error.message`                                 | Localized human-readable message.                                                                               |
| `message_key`                                   | Translation key for clients that want to localize themselves.                                                   |
| `details`                                       | Structured fields such as invalid fields, target resource, cleanup operation, retry timing, or limit name.      |
| Cleanup operations                              | Async deletion status for hidden Knowledge Bases, sources, objects, indexes, and row cleanup.                   |
| Cleanup operation lists                         | Return operation summaries and `item_counts`; load cleanup item pages from operation detail or retry responses. |
| `items_page` / `items_page_size`                | Bound the cleanup item section returned by cleanup detail and retry endpoints.                                  |
| `settled_state`                                 | Phase-level cleanup verification with object-storage, database, pending, failed, and residual artifact counts.  |
| `dependencies.metrics.api`                      | Recent API endpoint group counts, status counts, latency buckets, returned counts, page sizes, and warnings.    |
| `dependencies.metrics.cache`                    | Runtime cache hit, miss, expired miss, set, delete, and invalidation summaries by resource kind.                |
| `dependencies.migration`                        | Startup migration ownership and known migration target summary for deployed Docker Compose releases.            |
| `dependencies.metrics.objectStorageOperations`  | Recent S3-compatible operation counts by class, operation, caller, and status.                                  |
| `dependencies.pressure.objectStorageOperations` | Operation pressure state, Class A/B thresholds, hot callers, and tuning guidance keys.                          |

## Runtime Diagnostics

`GET /health` and settings/status payloads expose safe runtime diagnostics for large Knowledge Bases. API metrics group endpoints into categories such as jobs, sources, wiki, graph, retrieve, cleanup, and runtime status. They report counts, latency buckets, returned item counts, page sizes, totals, `has_more`, graph readiness states, and warning-code counts.

Cache metrics summarize runtime cache behavior by resource kind. Use them to detect repeated misses or invalidation-heavy workflows. Migration status reports that schema changes are owned by the dedicated startup migration service in Docker Compose deployments, so API and Worker containers can start against an already prepared schema.

## Durable Backend Errors

Production OpenAPI requests use PostgreSQL, pgvector, Redis, S3-compatible storage, queue workers, and persisted graph/source-evidence indexes. If a required backend is missing or unavailable, the API returns a typed response instead of switching to an in-memory compatibility path.

| Code                            | Typical status | When it appears                                                              |
| ------------------------------- | -------------: | ---------------------------------------------------------------------------- |
| `durable_backend_unavailable`   |          `503` | A required production backend or runtime dependency is not available.        |
| `bounded_retrieval_unavailable` |          `503` | Retrieve cannot reach the bounded PostgreSQL/pgvector retrieval backend.     |
| `graph_index_unavailable`       |          `503` | Graph traversal or graph insight indexes are not ready or cannot be queried. |
| `redis_metrics_degraded`        |          `503` | Redis-backed runtime metrics are unavailable for status or diagnostics.      |
| `parser_limit_exceeded`         |          `413` | Parser or Worker hard limits stop a source before unbounded memory use.      |
| `retrieve_index_not_ready`      |          `409` | Ingest has not produced usable Wiki/index state for this Knowledge Base yet. |

The response still includes `request_id`, a safe localized message, and structured `details`. Secrets, raw source text, prompts, signed URLs, storage keys, and raw SQL are not returned.

## OpenAPI

```yaml
openapi: "3.1.0"
info:
  title: "FocoContext Knowledge OpenAPI"
  version: "0.1.0"
  description: "Developer API for self-hosted Wiki-first knowledge ingestion, graph retrieval, versioning, and retrieval workflows. Human-readable messages support `X-Fococontext-Locale` and `Accept-Language`; machine-readable codes, IDs, enum values, and schema fields remain stable."
servers:
  - url: "http://localhost:18080/v1"
security:
  - bearerAuth: []
paths:
  "/cleanup-operations":
    get:
      summary: "List deletion cleanup operations"
      description: "Returns asynchronous cleanup operation summaries for visible deletion, object cleanup, database cleanup, and retry status. Operation items are loaded through the detail endpoint with item pagination."
      operationId: "listCleanupOperations"
      responses:
        200:
          description: "Deletion cleanup operations."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/ListEnvelope"
                  - type: "object"
                    properties:
                      data:
                        type: "array"
                        items:
                          "$ref": "#/components/schemas/CleanupOperation"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/cleanup-operations/{cleanup_operation_id}":
    get:
      summary: "Get deletion cleanup operation"
      description: "Returns cleanup phase, item counts, a bounded cleanup item page, settled-state verification, retry eligibility, and safe error summaries without provider secrets."
      operationId: "getCleanupOperation"
      parameters:
        - name: "items_page"
          in: "query"
          required: false
          description: "Cleanup item page number. Values start at 1."
          schema:
            type: "integer"
            default: 1
            minimum: 1
        - name: "items_page_size"
          in: "query"
          required: false
          description: "Number of cleanup items to return in the bounded item section."
          schema:
            type: "integer"
            default: 100
            minimum: 1
            maximum: 500
      responses:
        200:
          description: "Deletion cleanup operation."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/CleanupOperation"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/cleanup-operations/{cleanup_operation_id}/retry":
    post:
      summary: "Retry deletion cleanup operation"
      description: "Queues retry work for retryable failed or pending cleanup items and returns the operation with a bounded cleanup item page."
      operationId: "retryCleanupOperation"
      parameters:
        - name: "items_page"
          in: "query"
          required: false
          description: "Cleanup item page number in the returned operation. Values start at 1."
          schema:
            type: "integer"
            default: 1
            minimum: 1
        - name: "items_page_size"
          in: "query"
          required: false
          description: "Number of cleanup items to return in the bounded item section."
          schema:
            type: "integer"
            default: 100
            minimum: 1
            maximum: 500
      responses:
        200:
          description: "Deletion cleanup retry accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/CleanupRetryResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
components:
  securitySchemes:
    bearerAuth:
      type: "http"
      scheme: "bearer"
      description: "Use `Authorization: Bearer <FOCOCONTEXT_API_KEY>` for developer API calls. Admin Console sign-in uses the admin username/password flow instead."
  parameters:
    Locale:
      name: "X-Fococontext-Locale"
      in: "header"
      required: false
      description: "Preferred locale for human-readable API messages. Supported values are `en-US` and `zh-CN`."
      schema:
        type: "string"
        enum:
          - "en-US"
          - "zh-CN"
  responses:
    BadRequest:
      description: "The request is invalid. See `error.details` for field-level context."
      content:
        "application/json":
          schema:
            "$ref": "#/components/schemas/ErrorEnvelope"
    Unauthorized:
      description: "The Bearer API key is missing or invalid."
      content:
        "application/json":
          schema:
            "$ref": "#/components/schemas/ErrorEnvelope"
    InternalServerError:
      description: "The server failed unexpectedly. Use `request_id` for support correlation."
      content:
        "application/json":
          schema:
            "$ref": "#/components/schemas/ErrorEnvelope"
  schemas:
    ErrorEnvelope:
      type: "object"
      required:
        - "error"
        - "request_id"
      properties:
        error:
          "$ref": "#/components/schemas/ApiError"
        request_id:
          "$ref": "#/components/schemas/RequestId"
    ApiError:
      type: "object"
      required:
        - "code"
        - "message"
      properties:
        code:
          type: "string"
          enum:
            - "invalid_api_key"
            - "forbidden"
            - "knowledge_base_not_found"
            - "document_not_found"
            - "job_not_found"
            - "upload_session_not_found"
            - "page_not_found"
            - "version_not_found"
            - "unsupported_file_type"
            - "parser_failed"
            - "parser_timeout"
            - "password_protected_pdf"
            - "parser_output_empty"
            - "invalid_request"
            - "ingest_failed"
            - "change_set_conflict"
            - "retrieve_index_not_ready"
            - "fork_target_invalid"
            - "fork_submission_requires_fork"
            - "document_delete_preview_required"
            - "cleanup_operation_not_found"
            - "cleanup_operation_not_retryable"
            - "resource_deleted"
            - "resource_cleanup_pending"
            - "ingest_lock_conflict"
            - "rate_limited"
            - "internal_error"
        message:
          type: "string"
          description: "Human-readable message localized by `X-Fococontext-Locale` or `Accept-Language` when supported."
        locale:
          type: "string"
          enum:
            - "en-US"
            - "zh-CN"
        message_key:
          type: "string"
          description: "Optional stable localization key for clients that want to render their own copy."
        details:
          type: "object"
          additionalProperties: true
    StaleResourceErrorDetails:
      type: "object"
      required:
        - "target_type"
        - "target_id"
      properties:
        target_type:
          type: "string"
          enum:
            - "knowledge_base"
            - "source_document"
        target_id:
          "$ref": "#/components/schemas/ResourceId"
        cleanup_operation_id:
          oneOf:
            - "$ref": "#/components/schemas/CleanupOperationId"
            - type: "null"
        guidance:
          type: "string"
      additionalProperties: true
    CleanupOperation:
      type: "object"
      required:
        - "id"
        - "target_type"
        - "target_id"
        - "knowledge_base_id"
        - "status"
        - "phase"
        - "retryable"
        - "item_counts"
        - "created_at"
        - "updated_at"
      properties:
        id:
          "$ref": "#/components/schemas/CleanupOperationId"
        target_type:
          type: "string"
          enum:
            - "knowledge_base"
            - "source_document"
            - "source_watch_rule"
            - "webhook"
            - "import_preview"
            - "retrieval_trace"
        target_id:
          "$ref": "#/components/schemas/ResourceId"
        knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        status:
          "$ref": "#/components/schemas/CleanupStatus"
        phase:
          "$ref": "#/components/schemas/CleanupPhase"
        retryable:
          type: "boolean"
        item_counts:
          "$ref": "#/components/schemas/CleanupItemCounts"
        items:
          type: "array"
          description: "Bounded cleanup item page returned by operation detail and retry responses. Cleanup operation list responses return summaries and item counts without this section."
          items:
            "$ref": "#/components/schemas/CleanupItemSummary"
        items_pagination:
          "$ref": "#/components/schemas/CleanupItemPagination"
        created_at:
          "$ref": "#/components/schemas/Timestamp"
        updated_at:
          "$ref": "#/components/schemas/Timestamp"
      additionalProperties: true
    CleanupItemPagination:
      type: "object"
      required:
        - "page"
        - "page_size"
        - "total"
        - "has_more"
      properties:
        page:
          type: "integer"
          minimum: 1
        page_size:
          type: "integer"
          minimum: 1
          maximum: 500
        total:
          type: "integer"
          minimum: 0
        has_more:
          type: "boolean"
      additionalProperties: false
    CleanupRetryResponse:
      type: "object"
      required:
        - "cleanup_operation"
      properties:
        cleanup_operation:
          "$ref": "#/components/schemas/CleanupOperation"
      additionalProperties: false
    CleanupItemSummary:
      type: "object"
      required:
        - "id"
        - "operation_id"
        - "item_type"
        - "status"
        - "phase"
      properties:
        id:
          type: "string"
        operation_id:
          "$ref": "#/components/schemas/CleanupOperationId"
        item_type:
          type: "string"
          enum:
            - "object"
            - "database_row"
            - "reference"
            - "audit"
        status:
          type: "string"
          enum:
            - "pending"
            - "running"
            - "deleted"
            - "skipped"
            - "failed"
        phase:
          "$ref": "#/components/schemas/CleanupPhase"
      additionalProperties: true
```

## Request Example

A deleted source can return `resource_deleted` immediately, while object storage cleanup continues through cleanup operations. Accepted or queued cleanup is not fully settled cleanup.

```bash
curl "http://127.0.0.1:18080/v1/cleanup-operations?knowledge_base_id=<knowledge_base_id>" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## Response Example

```json
{
  "error": {
    "code": "resource_cleanup_pending",
    "message": "Resource cleanup is still running.",
    "message_key": "api.error.resource_cleanup_pending",
    "details": {
      "target_type": "source_document",
      "target_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2",
      "cleanup_operation_id": "cleanup_01HX2Z9P0Q1R2S3T4V5W6X7Y8Z"
    }
  },
  "request_id": "req_error"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl \"http://127.0.0.1:18080/v1/cleanup-operations?knowledge_base_id=<knowledge_base_id>\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\""
  response:
    summary: "Response example"
    value: '{ "error": { "code": "resource_cleanup_pending", "message": "Resource cleanup is still running.", "message_key": "api.error.resource_cleanup_pending", "details": { "target_type": "source_document", "target_id": "doc_01HX'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `400 invalid_request`: schema or validation failure.
- `401 invalid_api_key`: authentication failed.
- `404 not_found`: resource does not exist or is not visible.
- `409 resource_deleted`: resource is deleted and cannot accept normal operations.
- `429 rate_limit_error`: configured runtime limit or provider rate limit was reached.
- `500 internal_error`: unexpected server error; include `request_id` in support reports.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
