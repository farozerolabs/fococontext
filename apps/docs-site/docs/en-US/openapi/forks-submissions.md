# Forks and Submissions API

> Forks isolate user-owned overlays from canonical Knowledge Bases. Applications can submit user-owned content into a fork without polluting shared canonical knowledge.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page when your application needs user-owned, workspace-owned, customer-owned, or experiment-owned knowledge overlays on top of a canonical Knowledge Base.

## When to Use This Page

- Resolve or create one fork per external user, account, workspace, or tenant-specific overlay.
- Submit developer-controlled content into the fork as normal source ingest.
- Retrieve from the fork ID when you want upstream canonical context plus the target fork overlay.

## Endpoint Matrix

| Method   | Path                                                    | Summary                              | operationId              |
| -------- | ------------------------------------------------------- | ------------------------------------ | ------------------------ |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/forks`         | List knowledge base forks            | listKnowledgeBaseForks   |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/forks`         | Create a knowledge base fork         | createKnowledgeBaseFork  |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/forks/resolve` | Resolve a knowledge base fork        | resolveKnowledgeBaseFork |
| `GET`    | `/v1/forks/{fork_id}`                                   | Get a knowledge base fork            | getKnowledgeBaseFork     |
| `DELETE` | `/v1/forks/{fork_id}`                                   | Delete a knowledge base fork         | deleteKnowledgeBaseFork  |
| `POST`   | `/v1/forks/{fork_id}/sync`                              | Sync a knowledge base fork           | syncKnowledgeBaseFork    |
| `POST`   | `/v1/forks/{fork_id}/submissions`                       | Submit generated knowledge to a fork | submitForkKnowledge      |

## Field Guide

| Field               | Meaning                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `owner_type`        | External owner category such as user, account, workspace, or tenant.                     |
| `external_owner_id` | Stable owner identifier from your product.                                               |
| `visibility_origin` | Fork retrieve includes upstream inherited and fork-owned records, excluding other forks. |
| `submission`        | Creates a Source Document and Job in the fork. It does not run hosted research.          |
| `sync`              | Pulls upstream canonical updates into the fork visibility model.                         |

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
  "/knowledge-bases/{knowledge_base_id}/forks":
    get:
      summary: "List knowledge base forks"
      description: "Lists forked Knowledge Bases derived from the selected canonical Knowledge Base."
      operationId: "listKnowledgeBaseForks"
      responses:
        200:
          description: "Forked Knowledge Bases."
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
                          "$ref": "#/components/schemas/KnowledgeBase"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    post:
      summary: "Create a knowledge base fork"
      description: "Creates a forked Knowledge Base with explicit external owner metadata. Use resolve for idempotent lookup-or-create behavior."
      operationId: "createKnowledgeBaseFork"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/ForkResolveRequest"
      responses:
        200:
          description: "Forked Knowledge Base."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkResolveResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/forks/resolve":
    post:
      summary: "Resolve a knowledge base fork"
      description: "Idempotently returns an existing active fork or creates one for the canonical Knowledge Base and external owner."
      operationId: "resolveKnowledgeBaseFork"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/ForkResolveRequest"
      responses:
        200:
          description: "Resolved forked Knowledge Base."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkResolveResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/forks/{fork_id}":
    get:
      summary: "Get a knowledge base fork"
      operationId: "getKnowledgeBaseFork"
      responses:
        200:
          description: "Forked Knowledge Base."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/KnowledgeBase"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    delete:
      summary: "Delete a knowledge base fork"
      description: "Hides the fork and queues cleanup for fork-owned overlay records while preserving upstream canonical resources."
      operationId: "deleteKnowledgeBaseFork"
      responses:
        200:
          description: "Fork deletion accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkDeleteResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/forks/{fork_id}/sync":
    post:
      summary: "Sync a knowledge base fork"
      description: "Synchronizes a fork from its canonical upstream using a fork-owned versioned operation."
      operationId: "syncKnowledgeBaseFork"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/ForkSyncRequest"
      responses:
        200:
          description: "Fork sync status."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkSyncResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/forks/{fork_id}/submissions":
    post:
      summary: "Submit generated knowledge to a fork"
      description: "Accepts developer-generated Markdown or text plus evidence metadata and routes it through the normal fork-owned ingest pipeline."
      operationId: "submitForkKnowledge"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/CreateForkSubmissionRequest"
      responses:
        201:
          description: "Fork-owned submission accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkSubmissionResponse"
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
    ForkOwner:
      type: "object"
      required:
        - "owner_type"
        - "external_owner_id"
        - "display_name"
      properties:
        owner_type:
          type: "string"
          enum:
            - "user"
            - "workspace"
            - "customer"
            - "session"
            - "custom"
        external_owner_id:
          type: "string"
        display_name:
          type:
            - "string"
            - "null"
      additionalProperties: false
    ForkResolveRequest:
      type: "object"
      required:
        - "owner_type"
        - "external_owner_id"
      properties:
        owner_type:
          type: "string"
          enum:
            - "user"
            - "workspace"
            - "customer"
            - "session"
            - "custom"
        external_owner_id:
          type: "string"
        display_name:
          type:
            - "string"
            - "null"
        upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
      additionalProperties: false
    ForkResolveResponse:
      type: "object"
      required:
        - "created"
        - "fork"
      properties:
        created:
          type: "boolean"
        fork:
          "$ref": "#/components/schemas/KnowledgeBase"
      additionalProperties: false
    ForkSubmissionCitation:
      type: "object"
      properties:
        label:
          type: "string"
        title:
          type: "string"
        url:
          type: "string"
          format: "uri"
        locator:
          type: "string"
        metadata:
          "$ref": "#/components/schemas/CommonMetadata"
      additionalProperties: false
    ForkSubmissionEvidence:
      type: "object"
      properties:
        source_type:
          type: "string"
          description: "Developer-provided provenance type such as web, file, api, or user."
        title:
          type: "string"
        url:
          type: "string"
          format: "uri"
        snippet:
          type: "string"
        metadata:
          "$ref": "#/components/schemas/CommonMetadata"
      additionalProperties: false
    ForkSubmissionResponse:
      type: "object"
      required:
        - "fork_id"
        - "upstream_knowledge_base_id"
        - "document"
        - "job"
        - "evidence"
        - "citations"
      properties:
        fork_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        upstream_knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        document:
          "$ref": "#/components/schemas/SourceDocument"
        job:
          "$ref": "#/components/schemas/IngestJob"
        evidence:
          type: "array"
          items:
            "$ref": "#/components/schemas/ForkSubmissionEvidence"
        citations:
          type: "array"
          items:
            "$ref": "#/components/schemas/ForkSubmissionCitation"
      additionalProperties: true
    ForkSyncRequest:
      type: "object"
      properties:
        target_upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
      additionalProperties: false
    ForkSyncResponse:
      type: "object"
      required:
        - "fork_id"
        - "sync_status"
        - "operation_id"
        - "change_set_id"
        - "source_upstream_version_id"
        - "target_upstream_version_id"
        - "current_fork_version_id"
        - "conflicts"
      properties:
        fork_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        sync_status:
          type: "string"
          enum:
            - "synced"
            - "outdated"
            - "syncing"
            - "failed"
        operation_id:
          type:
            - "string"
            - "null"
        change_set_id:
          oneOf:
            - "$ref": "#/components/schemas/ChangeSetId"
            - type: "null"
        source_upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
        target_upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
        current_fork_version_id:
          "$ref": "#/components/schemas/KnowledgeVersionId"
        conflicts:
          type: "array"
          items:
            type: "object"
            required:
              - "type"
              - "upstream_page_id"
              - "fork_page_id"
              - "slug"
              - "title"
            properties:
              type:
                type: "string"
                enum:
                  - "fork_page_conflict"
              upstream_page_id:
                "$ref": "#/components/schemas/PageId"
              fork_page_id:
                "$ref": "#/components/schemas/PageId"
              slug:
                type: "string"
              title:
                type: "string"
            additionalProperties: true
      additionalProperties: true
    ForkDeleteResponse:
      type: "object"
      required:
        - "id"
        - "status"
        - "cleanup"
      properties:
        id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        status:
          type: "string"
          enum:
            - "deleted"
        cleanup:
          "$ref": "#/components/schemas/CleanupOperation"
      additionalProperties: false
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

Use forks for end-user-specific memory, product workspace overlays, or tenant customization. Keep canonical data clean and shared.

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/forks/resolve" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_type": "user",
    "external_owner_id": "user_123"
  }'
```

## Response Example

```json
{
  "data": {
    "fork": {
      "id": "kb_fork_01HX2Z1A2B3C4D5E6F7G8H9J0K",
      "knowledge_base_type": "fork",
      "upstream_knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A"
    },
    "created": true
  },
  "request_id": "req_fork_resolve"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/forks/resolve\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"owner_type\": \"user\", \"external_"
  response:
    summary: "Response example"
    value: '{ "data": { "fork": { "id": "kb_fork_01HX2Z1A2B3C4D5E6F7G8H9J0K", "knowledge_base_type": "fork", "upstream_knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A" }, "created": true }, "request_id": "req_fork_resolve" }'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `400 fork_target_invalid`: target is already a fork or cannot be forked.
- `400 fork_submission_requires_fork`: submissions must target a fork Knowledge Base.
- `409 fork_owner_conflict`: owner mapping conflicts with an existing fork.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
