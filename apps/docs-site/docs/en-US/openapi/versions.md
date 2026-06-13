# Versions and Rollback API

> Versioning makes generated knowledge auditable. Ingest, source lifecycle changes, fork submissions, page updates, rollback, and reindexing create traceable Change Sets and versions.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page to inspect Change Sets, Knowledge Versions, Page Versions, diffs, rollback records, and the audit trail behind retrieval behavior.

## When to Use This Page

- Use versions to diagnose a bad ingest or explain why a Retrieve result changed.
- Use rollback to create a new safe version while keeping history intact.
- Use Change Sets to inspect page, graph, source, and index effects before applying manual changes.

## Endpoint Matrix

| Method  | Path                                                  | Summary                         | operationId                 |
| ------- | ----------------------------------------------------- | ------------------------------- | --------------------------- |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/versions`    | List knowledge base versions    | listKnowledgeBaseVersions   |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/change-sets` | List knowledge base change sets | listKnowledgeBaseChangeSets |
| `GET`   | `/v1/change-sets/{change_set_id}`                     | Get a change set                | getChangeSet                |
| `POST`  | `/v1/change-sets/{change_set_id}/apply`               | Apply a change set              | applyChangeSet              |
| `POST`  | `/v1/change-sets/{change_set_id}/discard`             | Discard a change set            | discardChangeSet            |
| `POST`  | `/v1/knowledge-bases/{knowledge_base_id}/rollback`    | Roll back a knowledge base      | rollbackKnowledgeBase       |
| `GET`   | `/v1/pages/{page_id}/versions`                        | List wiki page versions         | listWikiPageVersions        |
| `POST`  | `/v1/pages/{page_id}/rollback`                        | Roll back a wiki page           | rollbackWikiPage            |
| `GET`   | `/v1/pages/{page_id}`                                 | Get a wiki page                 | getWikiPage                 |
| `PATCH` | `/v1/pages/{page_id}`                                 | Update a wiki page              | updateWikiPage              |

## Field Guide

| Field                    | Meaning                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `knowledge_version_id`   | Immutable Knowledge Base checkpoint.                                                                                          |
| `page_version_id`        | Immutable Wiki Page checkpoint.                                                                                               |
| `change_set_id`          | Diff container describing what changed and why.                                                                               |
| `trigger`                | Origin such as ingest, rollback, source_delete, page_merge, fork_submission, or manual_edit.                                  |
| `rollback`               | Creates a new version that points to previous content while keeping past versions intact.                                     |
| `cursor`                 | Opaque query token for large version and Change Set lists. Send `pagination.next_cursor` with `limit` to fetch the next page. |
| `pagination.next_cursor` | Next-page cursor returned by cursor-enabled lists. It is `null` or omitted when no next page remains.                         |

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
  "/knowledge-bases/{knowledge_base_id}/versions":
    get:
      summary: "List knowledge base versions"
      operationId: "listKnowledgeBaseVersions"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/change-sets":
    get:
      summary: "List knowledge base change sets"
      description: "Returns Knowledge Base-scoped Change Set summaries. Use the Change Set detail endpoint for full diff and item payloads."
      operationId: "listKnowledgeBaseChangeSets"
      responses:
        200:
          description: "Standard JSON list response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/change-sets/{change_set_id}":
    get:
      summary: "Get a change set"
      operationId: "getChangeSet"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/change-sets/{change_set_id}/apply":
    post:
      summary: "Apply a change set"
      operationId: "applyChangeSet"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/change-sets/{change_set_id}/discard":
    post:
      summary: "Discard a change set"
      operationId: "discardChangeSet"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/rollback":
    post:
      summary: "Roll back a knowledge base"
      operationId: "rollbackKnowledgeBase"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/pages/{page_id}/versions":
    get:
      summary: "List wiki page versions"
      operationId: "listWikiPageVersions"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/pages/{page_id}/rollback":
    post:
      summary: "Roll back a wiki page"
      operationId: "rollbackWikiPage"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/pages/{page_id}":
    get:
      summary: "Get a wiki page"
      operationId: "getWikiPage"
      responses:
        200:
          description: "Wiki page detail."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/WikiPage"
    patch:
      summary: "Update a wiki page"
      operationId: "updateWikiPage"
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
    KnowledgeVersionId:
      type: "string"
      pattern: "^kbv_[a-zA-Z0-9]+$"
    PageVersionId:
      type: "string"
      pattern: "^pgv_[a-zA-Z0-9]+$"
    ChangeSetId:
      type: "string"
      pattern: "^cs_[a-zA-Z0-9]+$"
    WikiPage:
      type: "object"
      required:
        - "id"
        - "knowledge_base_id"
        - "slug"
        - "title"
        - "type"
        - "status"
        - "markdown"
        - "frontmatter"
        - "source_document_ids"
        - "metadata"
      properties:
        id:
          "$ref": "#/components/schemas/WikiPageId"
        markdown:
          type: "string"
          description: "Renderable Markdown with frontmatter-compatible metadata, wikilinks, source references, media references, and Markdown extensions."
        source_refs:
          type: "array"
          items:
            "$ref": "#/components/schemas/SourceRef"
        media_refs:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        wikilink_targets:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        visibility_origin:
          "$ref": "#/components/schemas/VisibilityOrigin"
      additionalProperties: true
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

For production recovery, fetch versions, inspect the Change Set, then rollback the Knowledge Base or a single page.

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/rollback" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"target_version_id":"kbv_000012","reason":"Restore known good docs"}'
```

## Response Example

```json
{
  "data": {
    "rollback_id": "rb_01HX2YR8S9T0V1W2X3Y4Z5A6B7",
    "change_set_id": "cs_01HX2YF4G5H6J7K8M9N0P1Q2R3",
    "knowledge_version_id": "kbv_000013",
    "affected_page_ids": ["page_01HX2YA2BC3D4E5F6G7H8J9K0M"]
  },
  "request_id": "req_rollback"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/rollback\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{\"target_version_id\":\"kbv_000012\",\"reas"
  response:
    summary: "Response example"
    value: '{ "data": { "rollback_id": "rb_01HX2YR8S9T0V1W2X3Y4Z5A6B7", "change_set_id": "cs_01HX2YF4G5H6J7K8M9N0P1Q2R3", "knowledge_version_id": "kbv_000013", "affected_page_ids": ["page_01HX2YA2BC3D4E5F6G7H8J9K0M"] }, "request_id"'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `404 version_not_found`: requested version does not exist.
- `409 stale_version`: target version cannot be applied to current state.
- `409 resource_deleted`: deleted resources cannot be updated or rolled back through normal routes.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
