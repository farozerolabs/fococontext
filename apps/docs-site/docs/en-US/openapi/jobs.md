# Jobs API

> Jobs expose asynchronous ingest and compile state for uploads, Source Watch scans, fork submissions, reindexing, OCR, caption, and cleanup-related work.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page to poll ingest jobs, batch job status, Knowledge Base ingest progress, retryable failures, cancelable work, and stage timelines.

## When to Use This Page

- Poll job detail after creating a source or submission.
- Use batch job status after multi-file uploads.
- Use Knowledge Base ingest progress when you need aggregate progress and Retrieve readiness.
- Display timeline events newest-first for operators, while treating them as historical records.
- Retry only failed retryable work; cancel only active work that has not already reached a terminal state.

## Endpoint Matrix

| Method | Path                                                      | Summary                                              | operationId                    |
| ------ | --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| `GET`  | `/v1/jobs/{job_id}`                                       | Get ingest job status and compile stage events       | getIngestJobStatus             |
| `POST` | `/v1/jobs/batch`                                          | Resolve multiple ingest job statuses                 | getIngestJobStatuses           |
| `POST` | `/v1/jobs/{job_id}/retry`                                 | Retry an ingest job                                  | retryIngestJob                 |
| `POST` | `/v1/jobs/{job_id}/cancel`                                | Cancel an ingest job                                 | cancelIngestJob                |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/jobs`            | List Knowledge Base jobs with compile stage events   | listKnowledgeBaseJobs          |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/ingest-progress` | Get aggregate ingest progress and Retrieve readiness | getKnowledgeBaseIngestProgress |

## Field Guide

| Field            | Meaning                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`         | `queued`, `running`, `completed`, `failed`, or `canceled`.                                                                                                                |
| `stage`          | Current stage such as parsing, OCR, captioning, analyzing, generating, merging, or indexing.                                                                              |
| `progress`       | Must stay below 100 while running; `100` is reserved for completed terminal state.                                                                                        |
| `timeline`       | Append-only historical events with localized messages and structured metadata.                                                                                            |
| `error`          | Safe failed-job or failed-event summary. `error.category=output_validation_failed` means model output could not satisfy the structured schema after normalization/repair. |
| `retrieve_ready` | Knowledge Base ingest progress flag that tells clients whether Retrieve can start without deriving readiness from every job.                                              |
| `request_id`     | Use this together with `job_id` when debugging support cases.                                                                                                             |

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
  "/jobs/{job_id}":
    get:
      summary: "Get ingest job status and compile stage events"
      description: "Returns the durable ingest Job. `progress: 100` means terminal completion; running, failed, and canceled jobs stay below `100`. Timeline events are persisted historical events and do not include fabricated future stages."
      operationId: "getIngestJobStatus"
      responses:
        200:
          description: "Ingest job status."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/IngestJob"
              example:
                data:
                  id: "job_example"
                  status: "running"
                  stage: "generating"
                  progress: 55
                  progress_message: "Generating wiki drafts..."
                  events:
                    - type: "job.running"
                      stage: "generating"
                      status: "running"
                      message: "Generating wiki drafts..."
                      metadata:
                        analysis_result_id: "analysis_example"
                      created_at: "2026-05-21T01:00:00.000Z"
                request_id: "req_example"
  "/jobs/{job_id}/retry":
    post:
      summary: "Retry an ingest job"
      operationId: "retryIngestJob"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/jobs/batch":
    post:
      summary: "Resolve multiple ingest job statuses"
      description: "Preserves input order and returns item-level errors for missing or inaccessible jobs without revealing cross-scope existence."
      operationId: "getIngestJobStatuses"
      responses:
        200:
          description: "Batch ingest job status."
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/ingest-progress":
    get:
      summary: "Get aggregate ingest progress and Retrieve readiness"
      operationId: "getKnowledgeBaseIngestProgress"
      responses:
        200:
          description: "Knowledge Base ingest progress summary."
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/jobs/{job_id}/cancel":
    post:
      summary: "Cancel an ingest job"
      operationId: "cancelIngestJob"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/jobs":
    get:
      summary: "List Knowledge Base jobs with compile stage events"
      description: "Returns user-facing Knowledge Base jobs. Internal Graph Insights refresh records are excluded from this list and remain observable through Graph Insights status endpoints."
      operationId: "listKnowledgeBaseJobs"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
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
    IngestJob:
      type: "object"
      required:
        - "id"
        - "status"
        - "stage"
        - "progress"
      properties:
        id:
          "$ref": "#/components/schemas/IngestJobId"
        status:
          type: "string"
          enum:
            - "queued"
            - "running"
            - "completed"
            - "failed"
            - "canceled"
        stage:
          type: "string"
          enum:
            - "parsing"
            - "ocr"
            - "captioning"
            - "analyzing"
            - "generating"
            - "merging"
            - "indexing"
        progress:
          type: "integer"
          description: "`100` is reserved for terminal `completed` jobs. Queued, running, failed, and canceled jobs remain below `100`."
          minimum: 0
          maximum: 100
        progress_message:
          type: "string"
          description: "Human-readable current state. Terminal jobs use terminal copy instead of active stage copy."
        events:
          type: "array"
          description: "Persisted historical job events only. Clients should not infer future stages from this list."
          items:
            type: "object"
            required:
              - "type"
              - "stage"
              - "status"
              - "message"
              - "metadata"
              - "created_at"
            properties:
              type:
                type: "string"
                enum:
                  - "job.queued"
                  - "job.running"
                  - "job.completed"
                  - "job.failed"
                  - "job.canceled"
              stage:
                type: "string"
                enum:
                  - "parsing"
                  - "ocr"
                  - "captioning"
                  - "analyzing"
                  - "generating"
                  - "merging"
                  - "indexing"
              status:
                type: "string"
                enum:
                  - "queued"
                  - "running"
                  - "completed"
                  - "failed"
                  - "canceled"
              message:
                type: "string"
              metadata:
                type: "object"
                description: "Safe event metadata. Prompt-configurable stages may include `prompt_template`; model-output stages may include `structured_output_attempt_count`, `structured_output_repair_attempts`, `structured_output_final_status`, and safe validation issue summaries. Raw provider output, secrets, and full prompt text are excluded."
                additionalProperties: true
              error:
                type:
                  - "object"
                  - "null"
                description: "Safe stage error summary. `category` classifies provider and model-output failures such as `output_validation_failed` without exposing raw provider output or secrets."
                properties:
                  category:
                    type: "string"
                  code:
                    type: "string"
                  message:
                    type: "string"
                  retryable:
                    type: "boolean"
                additionalProperties: true
              created_at:
                "$ref": "#/components/schemas/Timestamp"
            additionalProperties: true
        error:
          type:
            - "object"
            - "null"
          description: "Safe job error summary for failed jobs. `category` separates provider failures from model output validation failures such as `output_validation_failed`."
          properties:
            category:
              type: "string"
            code:
              type: "string"
            message:
              type: "string"
            retryable:
              type: "boolean"
          additionalProperties: true
      additionalProperties: true
    IngestJobId:
      type: "string"
      pattern: "^job_[a-zA-Z0-9]+$"
    SuccessEnvelope:
      type: "object"
      required:
        - "data"
        - "request_id"
      properties:
        data: true
        request_id:
          "$ref": "#/components/schemas/RequestId"
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
```

## Request Example

Use job status as the source of truth before calling Retrieve. Retrieve can return not-ready errors while ingest is still running.

```bash
curl "http://127.0.0.1:18080/v1/jobs/<job_id>" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## Response Example

```json
{
  "data": {
    "id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q",
    "status": "running",
    "stage": "generating",
    "progress": 55,
    "progress_message": "Generating wiki drafts...",
    "document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2",
    "timeline": [
      {
        "event": "job.running",
        "message": "Generating wiki drafts...",
        "created_at": "2026-05-22T10:00:00.000Z"
      }
    ]
  },
  "request_id": "req_job_detail"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl \"http://127.0.0.1:18080/v1/jobs/<job_id>\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\""
  response:
    summary: "Response example"
    value: '{ "data": { "id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q", "status": "running", "stage": "generating", "progress": 55, "progress_message": "Generating wiki drafts...", "document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "timeline"'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `404 job_not_found`: the job ID does not exist or is no longer visible.
- `409 job_not_retryable`: job is not failed or retry cannot safely restart work.
- `409 job_not_cancelable`: job is already terminal or cleanup-fenced.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
