# Wiki and Graph API

> Wiki Pages are the long-lived knowledge assets produced by ingest. Graph endpoints expose relationships, evidence, communities, bridges, gaps, and retrieval expansion signals.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page to render generated Wiki Pages, inspect page relationships, expose graph views, and validate portable Markdown exports.

## When to Use This Page

- Use pages endpoints to render generated Markdown, page metadata, source references, and versions.
- Use graph endpoints for Graph View, related-page exploration, and graph-aware retrieval debugging.
- Use Markdown export and contract validation when your product needs portable Wiki-compatible content.

## Endpoint Matrix

| Method  | Path                                                                 | Summary                    | operationId              |
| ------- | -------------------------------------------------------------------- | -------------------------- | ------------------------ |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/pages`                      | List wiki pages            | listWikiPages            |
| `GET`   | `/v1/pages/{page_id}`                                                | Get a wiki page            | getWikiPage              |
| `PATCH` | `/v1/pages/{page_id}`                                                | Update a wiki page         | updateWikiPage           |
| `GET`   | `/v1/pages/{page_id}/related`                                        | List related wiki pages    | listRelatedWikiPages     |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/system-pages`               | List system pages          | listSystemPages          |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/system-pages/{type}`        | Get a system page          | getSystemPage            |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/graph`                      | Get knowledge graph        | getKnowledgeGraph        |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/graph/insights`             | Get graph insights         | getGraphInsights         |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/markdown-export`            | Export Markdown            | exportMarkdown           |
| `POST`  | `/v1/knowledge-bases/{knowledge_base_id}/markdown-contract/validate` | Validate Markdown Contract | validateMarkdownContract |

## Field Guide

| Field               | Meaning                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `page_type`         | `source`, `entity`, `concept`, `synthesis`, `comparison`, `query`, or `system`.                        |
| `source_refs`       | Traceability records pointing back to text, OCR, or image caption evidence.                            |
| `relation_type`     | `wikilink`, `shared_source`, `common_neighbor`, `type_affinity`, or `manual`.                          |
| `visibility_origin` | Distinguishes canonical, inherited upstream, and fork-owned records.                                   |
| `graph_insights`    | Communities, bridges, isolated pages, sparse areas, gaps, and surprising connections.                  |
| `graph_readiness`   | Materialized graph insight state returned by graph-aware APIs.                                         |
| `warnings`          | Non-fatal graph warning codes such as `graph.readiness.updating` or `graph.limit.edge_budget_reached`. |

## Graph Readiness

Graph APIs and Retrieve responses can include `graph_readiness` so clients can distinguish direct Wiki retrieval from materialized graph insight readiness. The state is one of `queued`, `updating`, `ready`, `failed`, `partial`, or `stale`.

Use `ready` for graph insight dashboards and graph-heavy Agent expansion. For `queued` or `updating`, show progress and retry later. For `partial`, `stale`, or `failed`, keep the direct Wiki result usable and mark graph insight sections as limited. Non-ready states are also surfaced through request warnings as `graph.readiness.<state>`.

Large Knowledge Bases should page Wiki pages and system pages through the list APIs instead of requesting every node for UI filtering. Use graph endpoints for the current view, Retrieve Expand for layered exploration, and runtime metrics for pressure signals.

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
  "/knowledge-bases/{knowledge_base_id}/pages":
    get:
      summary: "List wiki pages"
      operationId: "listWikiPages"
      responses:
        200:
          description: "Wiki pages."
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
                          "$ref": "#/components/schemas/WikiPage"
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
  "/pages/{page_id}/related":
    get:
      summary: "List related wiki pages"
      operationId: "listRelatedWikiPages"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/system-pages":
    get:
      summary: "List system pages"
      operationId: "listSystemPages"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/system-pages/{type}":
    get:
      summary: "Get a system page"
      operationId: "getSystemPage"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/graph":
    get:
      summary: "Get knowledge graph"
      description: "Returns graph nodes and edges derived from Wiki links, generated relationships, shared sources, common neighbors, type affinity, and evidence relationships."
      operationId: "getKnowledgeGraph"
      responses:
        200:
          description: "Knowledge graph."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/Graph"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/graph/insights":
    get:
      summary: "Get graph insights"
      description: "Returns graph insight status plus isolated pages, sparse pages, bridge pages, communities, knowledge gaps, surprising connections, and explicit empty reasons."
      operationId: "getGraphInsights"
      responses:
        200:
          description: "Graph insights."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/GraphInsights"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/markdown-export":
    get:
      summary: "Export Markdown"
      operationId: "exportMarkdown"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/markdown-contract/validate":
    post:
      summary: "Validate Markdown Contract"
      operationId: "validateMarkdownContract"
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
    Graph:
      type: "object"
      required:
        - "knowledge_base_id"
        - "nodes"
        - "edges"
      properties:
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        nodes:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphNode"
        edges:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphEdge"
      additionalProperties: true
    GraphNode:
      type: "object"
      required:
        - "page_id"
        - "title"
        - "type"
        - "source_refs"
      properties:
        page_id:
          "$ref": "#/components/schemas/WikiPageId"
        page_version_id:
          "$ref": "#/components/schemas/PageVersionId"
        title:
          type: "string"
        type:
          type: "string"
        source_refs:
          type: "array"
          items:
            "$ref": "#/components/schemas/SourceRef"
        visibility_origin:
          "$ref": "#/components/schemas/VisibilityOrigin"
      additionalProperties: true
    GraphEdge:
      type: "object"
      required:
        - "edge_id"
        - "from_page_id"
        - "to_page_id"
        - "relation_type"
        - "weight"
        - "source_document_ids"
      properties:
        edge_id:
          "$ref": "#/components/schemas/GraphEdgeId"
        from_page_id:
          "$ref": "#/components/schemas/WikiPageId"
        to_page_id:
          "$ref": "#/components/schemas/WikiPageId"
        relation_type:
          type: "string"
        explanation:
          type: "string"
        source_document_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/SourceDocumentId"
        weight:
          type: "number"
        algorithm:
          "$ref": "#/components/schemas/GraphAlgorithmMetadata"
        signal_contributions:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphSignalContribution"
        visibility_origin:
          "$ref": "#/components/schemas/VisibilityOrigin"
      additionalProperties: true
    GraphInsights:
      type: "object"
      required:
        - "knowledge_base_id"
        - "status"
        - "isolated_pages"
        - "sparse_pages"
        - "bridge_pages"
        - "knowledge_gaps"
        - "communities"
        - "surprising_connections"
        - "empty_reasons"
        - "snapshot"
      properties:
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        status:
          "$ref": "#/components/schemas/GraphInsightStatus"
        snapshot:
          "$ref": "#/components/schemas/GraphInsightSnapshot"
        isolated_pages:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        sparse_pages:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        bridge_pages:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        knowledge_gaps:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        communities:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        surprising_connections:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        empty_reasons:
          type: "object"
          additionalProperties:
            type: "string"
      additionalProperties: true
    GraphInsightItem:
      type: "object"
      required:
        - "id"
        - "insight_type"
      properties:
        id:
          type: "string"
        insight_type:
          type: "string"
          enum:
            - "isolated_page"
            - "sparse_page"
            - "bridge_page"
            - "knowledge_gap"
            - "community"
            - "surprising_connection"
        page_id:
          oneOf:
            - "$ref": "#/components/schemas/WikiPageId"
            - type: "null"
        page_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/WikiPageId"
        reason_codes:
          type: "array"
          items:
            type: "string"
        signal_contributions:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphSignalContribution"
        severity:
          type: "string"
          enum:
            - "low"
            - "medium"
            - "high"
      additionalProperties: true
    SourceRef:
      type: "object"
      description: "Traceable source evidence attached to a page, graph edge, or result."
      properties:
        document_id:
          "$ref": "#/components/schemas/SourceDocumentId"
        locator:
          type: "string"
        media_asset_id:
          "$ref": "#/components/schemas/MediaAssetId"
        evidence_kind:
          type: "string"
          enum:
            - "text"
            - "image_caption"
            - "ocr"
          description: "Identifies whether the source evidence came from native text, OCR text, or a vision caption."
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

After ingest completes, read pages and graph together. A page without source references is not production-ready evidence.

```bash
curl "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/graph?include_insights=true" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## Response Example

```json
{
  "data": {
    "nodes": [
      {
        "id": "page_01HX2YA2BC3D4E5F6G7H8J9K0M",
        "title": "Source cleanup",
        "page_type": "concept",
        "visibility_origin": "canonical"
      }
    ],
    "edges": [
      {
        "id": "edge_01HX2YM4N5P6Q7R8S9T0V1W2X3",
        "source_page_id": "page_a",
        "target_page_id": "page_b",
        "relation_type": "shared_source",
        "weight": 0.82
      }
    ]
  },
  "request_id": "req_graph"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/graph?include_insights=true\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\""
  response:
    summary: "Response example"
    value: '{ "data": { "nodes": [ { "id": "page_01HX2YA2BC3D4E5F6G7H8J9K0M", "title": "Source cleanup", "page_type": "concept", "visibility_origin": "canonical" } ], "edges": [ { "id": "edge_01HX2YM4N5P6Q7R8S9T0V1W2X3", "source_pag'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `404 page_not_found`: page ID does not exist or is hidden by fork visibility.
- `409 retrieval_not_ready`: graph/index state is not ready yet.
- `400 invalid_graph_depth`: requested expansion depth exceeds configured limits.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
