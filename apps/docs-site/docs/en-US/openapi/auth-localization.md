# Authentication and Localization

> Developer APIs use Bearer API keys. Admin Console sign-in uses cookie-backed admin sessions and is intentionally separate from external API access.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page to wire authentication, localized human messages, and stable machine-readable codes before calling product endpoints.

## When to Use This Page

- Configure `FOCOCONTEXT_API_KEY` or generated API keys for server-side integrations.
- Send `X-Fococontext-Locale` when your product needs localized human-readable messages.
- Use stable codes, IDs, enum values, and object keys for program logic.

## Endpoint Matrix

| Method | Path                  | Summary                 | operationId         |
| ------ | --------------------- | ----------------------- | ------------------- |
| `GET`  | `/v1/knowledge-bases` | List knowledge bases    | listKnowledgeBases  |
| `POST` | `/v1/knowledge-bases` | Create a knowledge base | createKnowledgeBase |

## Field Guide

| Field            | Meaning                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Authorization    | `Authorization: Bearer <FOCOCONTEXT_API_KEY>` on every protected `/v1` request.                                      |
| Locale order     | `X-Fococontext-Locale`, then `Accept-Language`, then server default.                                                 |
| Localized fields | `error.message`, job progress messages, and timeline messages may be localized.                                      |
| Stable fields    | `error.code`, IDs, enum values, object keys, provider names, model names, filenames, and `context_pack` stay stable. |

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
  "/knowledge-bases":
    get:
      summary: "List knowledge bases"
      operationId: "listKnowledgeBases"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    post:
      summary: "Create a knowledge base"
      operationId: "createKnowledgeBase"
      responses:
        201:
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

Use API keys from a server process. Do not reuse Admin Console credentials as API credentials.

```bash
curl "http://127.0.0.1:18080/v1/knowledge-bases" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "X-Fococontext-Locale: en-US"
```

## Response Example

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 0,
    "has_more": false
  },
  "request_id": "req_auth_example"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl \"http://127.0.0.1:18080/v1/knowledge-bases\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"X-Fococontext-Locale: en-US\""
  response:
    summary: "Response example"
    value: '{ "data": [], "pagination": { "page": 1, "page_size": 20, "total": 0, "has_more": false }, "request_id": "req_auth_example" }'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `401 invalid_api_key`: missing, malformed, revoked, or unknown key.
- `403 forbidden`: the caller is authenticated but cannot perform the requested operation.
- `400 invalid_locale`: locale is unsupported; use `en-US` or `zh-CN`.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
