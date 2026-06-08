# API Overview

> Use FocoContext as a server-side, Wiki-first knowledge service. The API accepts sources, compiles them into Wiki Pages, maintains graph and version state, and returns retrieval context for your own application backend.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

This public documentation site publishes human-readable guidance. The machine-readable contract stays instance-local so it matches the Docker image and environment you are running.

Use the authenticated contract to discover all available paths, schemas, responses, and error structures. Generated SDKs and contract tests should use the complete `/openapi.json` document from your deployment.

## When to Use This Page

- Start here when you are integrating FocoContext for the first time.
- Use the machine-readable OpenAPI contract for generated clients and the pages below for implementation guidance.
- Keep Bearer API keys on your server. Browser-only applications should call your backend, not FocoContext directly.

## Endpoint Matrix

| Method | Path                                               | Summary                               | operationId              |
| ------ | -------------------------------------------------- | ------------------------------------- | ------------------------ |
| `GET`  | `/v1/knowledge-bases`                              | List knowledge bases                  | listKnowledgeBases       |
| `POST` | `/v1/knowledge-bases`                              | Create a knowledge base               | createKnowledgeBase      |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve` | Retrieve wiki-based knowledge context | retrieveKnowledgeContext |

## Field Guide

| Field             | Meaning                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Base URL          | `http://127.0.0.1:18080/v1` locally, your HTTPS API domain in production.                                                      |
| Contract URL      | `GET /openapi.json` from the API host root. Anonymous access is rejected; use an Admin Console session or a Bearer API key.    |
| Response envelope | Successful JSON responses include `data` and `request_id`; lists also include `pagination`.                                    |
| Error envelope    | Errors include stable `error.code`, localized `error.message`, optional `message_key`, structured `details`, and `request_id`. |

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
  "/knowledge-bases/{knowledge_base_id}/retrieve":
    post:
      summary: "Retrieve wiki-based knowledge context"
      description: "Retrieves Wiki Page-centered context with citations, graph-expanded items, context pack data, and optional trace metadata."
      operationId: "retrieveKnowledgeContext"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/RetrieveRequest"
            example:
              context_budget_tokens: 4000
              graph_depth: 1
              include_context_pack: true
              include_expand_hints: true
              include_graph: true
              include_trace: true
              mode: "hybrid"
              query: "中文 graph context"
              top_k: 10
      responses:
        200:
          description: "Retrieve result."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/RetrieveResponse"
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
    RequestId:
      type: "string"
      pattern: "^req_[a-zA-Z0-9]+$"
    Pagination:
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
        total:
          type: "integer"
          minimum: 0
        has_more:
          type: "boolean"
```

## Request Example

Call authenticated `GET /openapi.json`, create a Knowledge Base, upload sources, poll Jobs, inspect Wiki and Graph outputs, then call Retrieve.

```bash
curl "http://127.0.0.1:18080/openapi.json" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## Response Example

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "FocoContext Knowledge OpenAPI",
    "version": "0.1.0"
  },
  "servers": [{ "url": "http://127.0.0.1:18080/v1" }]
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: 'curl "http://127.0.0.1:18080/openapi.json" -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"'
  response:
    summary: "Response example"
    value: '{ "openapi": "3.1.0", "info": { "title": "FocoContext Knowledge OpenAPI", "version": "0.1.0" }, "servers": [{ "url": "http://127.0.0.1:18080/v1" }] }'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `401 invalid_api_key`: protected `/v1` routes require `Authorization: Bearer <FOCOCONTEXT_API_KEY>`.
- `400 invalid_request`: validation failed; inspect `error.details.fields` when present.
- `404 not_found`: the resource does not exist or is hidden by lifecycle state.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
