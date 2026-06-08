# Source Watch API

> Source Watch turns external locations into repeatable source discovery. Rules can scan mounted directories, S3 prefixes, URL lists, and Git repositories when deployment readiness allows it.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page when your deployment should discover source changes from mounted directories, S3 prefixes, URL lists, or Git repositories.

## When to Use This Page

- Use mounted directory rules for server-side folders mounted into the API container.
- Use S3, URL list, and Git rules with dedicated Source Watch credentials.
- Use scan history to observe schedules, failures, recovered scans, created documents, and delete candidates.

## Endpoint Matrix

| Method  | Path                                                         | Summary                        | operationId                |
| ------- | ------------------------------------------------------------ | ------------------------------ | -------------------------- |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/source-watch-rules` | List source watch rules        | listSourceWatchRules       |
| `POST`  | `/v1/knowledge-bases/{knowledge_base_id}/source-watch-rules` | Create a source watch rule     | createSourceWatchRule      |
| `GET`   | `/v1/source-watch-rules/{rule_id}`                           | Get source watch rule status   | getSourceWatchRuleStatus   |
| `PATCH` | `/v1/source-watch-rules/{rule_id}`                           | Update a source watch rule     | updateSourceWatchRule      |
| `POST`  | `/v1/source-watch-rules/{rule_id}/scan`                      | Scan a source watch rule       | scanSourceWatchRule        |
| `POST`  | `/v1/source-watch-rules/{rule_id}/enable`                    | Enable a source watch rule     | enableSourceWatchRule      |
| `POST`  | `/v1/source-watch-rules/{rule_id}/disable`                   | Disable a source watch rule    | disableSourceWatchRule     |
| `GET`   | `/v1/source-watch-rules/{rule_id}/scans`                     | List source watch scan history | listSourceWatchScanHistory |
| `GET`   | `/v1/scheduled-import-jobs/{scheduled_import_job_id}`        | Get scheduled import job       | getScheduledImportJob      |

## Field Guide

| Field               | Meaning                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `source_kind`       | `mounted_directory`, `s3_prefix`, `url_list`, or `git_repo`.                                       |
| `location`          | Adapter-specific object such as container path, S3 bucket/prefix, URL list, or Git repository URL. |
| `auto_ingest`       | When true, discovered new or changed sources create Source Documents and Jobs.                     |
| `delete_candidates` | Potential removals require delete impact preview before cleanup.                                   |
| `scan history`      | Durable status for scheduled and manual scans, including failure and retry metadata.               |

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
  "/knowledge-bases/{knowledge_base_id}/source-watch-rules":
    get:
      summary: "List source watch rules"
      operationId: "listSourceWatchRules"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    post:
      summary: "Create a source watch rule"
      operationId: "createSourceWatchRule"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}":
    get:
      summary: "Get source watch rule status"
      operationId: "getSourceWatchRuleStatus"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    patch:
      summary: "Update a source watch rule"
      operationId: "updateSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/scan":
    post:
      summary: "Scan a source watch rule"
      operationId: "scanSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/enable":
    post:
      summary: "Enable a source watch rule"
      operationId: "enableSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/disable":
    post:
      summary: "Disable a source watch rule"
      operationId: "disableSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/scans":
    get:
      summary: "List source watch scan history"
      operationId: "listSourceWatchScanHistory"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/scheduled-import-jobs/{scheduled_import_job_id}":
    get:
      summary: "Get scheduled import job"
      operationId: "getScheduledImportJob"
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
    SourceWatchRuleId:
      type: "string"
      pattern: "^swr_[a-zA-Z0-9]+$"
    ScheduledImportJobId:
      type: "string"
      pattern: "^sij_[a-zA-Z0-9]+$"
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

A rule scan enters the normal ingest flow. Created files still flow through Source Document, Job, Wiki, Graph, Version, and Retrieve readiness.

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/source-watch-rules" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mounted docs",
    "source_kind": "mounted_directory",
    "location": { "path": "/source-watch/docs" },
    "auto_ingest": true,
    "schedule": "*/15 * * * *"
  }'
```

## Response Example

```json
{
  "data": {
    "id": "swr_01HX2YS4T5V6W7X8Y9Z0A1B2C3",
    "name": "Mounted docs",
    "source_kind": "mounted_directory",
    "enabled": true,
    "last_scan_status": null
  },
  "request_id": "req_source_watch"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/source-watch-rules\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"name\": \"Mounted docs\", \"so"
  response:
    summary: "Response example"
    value: '{ "data": { "id": "swr_01HX2YS4T5V6W7X8Y9Z0A1B2C3", "name": "Mounted docs", "source_kind": "mounted_directory", "enabled": true, "last_scan_status": null }, "request_id": "req_source_watch" }'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `400 source_watch_adapter_not_configured`: adapter readiness or credentials are missing.
- `400 source_watch_location_invalid`: path, URL, bucket, prefix, or repository is invalid.
- `409 source_watch_scan_locked`: another scan is already running for the rule.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
