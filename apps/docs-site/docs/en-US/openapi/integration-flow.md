# Integration Flow

> A production integration should treat FocoContext as a service boundary: your backend owns users and business logic; FocoContext owns knowledge ingestion, Wiki compilation, graph retrieval, versions, and source traceability.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use the authenticated contract to discover all available paths, schemas, responses, and error structures. This page gives the production integration sequence that turns source files into retrievable Wiki knowledge.

## When to Use This Page

- Use this page as the end-to-end checklist before going live.
- Implement the canonical flow first, then add forks, Source Watch, Webhooks, and advanced retrieval.
- Test with real documents and your actual model, storage, parser, OCR, caption, embedding, rerank, and webhook configuration.

## Endpoint Matrix

| Method | Path                                                      | Summary                                              | operationId                    |
| ------ | --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| `GET`  | `/v1/knowledge-bases`                                     | List knowledge bases                                 | listKnowledgeBases             |
| `POST` | `/v1/knowledge-bases`                                     | Create a knowledge base                              | createKnowledgeBase            |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/documents`       | List source documents                                | listSourceDocuments            |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/documents`       | Upload a source document                             | uploadSourceDocument           |
| `GET`  | `/v1/jobs/{job_id}`                                       | Get ingest job status and compile stage events       | getIngestJobStatus             |
| `POST` | `/v1/jobs/batch`                                          | Resolve multiple ingest job statuses                 | getIngestJobStatuses           |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/ingest-progress` | Get aggregate ingest progress and Retrieve readiness | getKnowledgeBaseIngestProgress |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/pages`           | List wiki pages                                      | listWikiPages                  |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/graph`           | Get knowledge graph                                  | getKnowledgeGraph              |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve`        | Retrieve wiki-based knowledge context                | retrieveKnowledgeContext       |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve/expand` | Expand retrieved wiki graph context                  | expandRetrievedGraphContext    |
| `POST` | `/v1/source-evidence/resolve`                             | Resolve source evidence in batch                     | resolveSourceEvidence          |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/forks/resolve`   | Resolve a knowledge base fork                        | resolveKnowledgeBaseFork       |
| `POST` | `/v1/forks/{fork_id}/submissions`                         | Submit generated knowledge to a fork                 | submitForkKnowledge            |
| `GET`  | `/v1/webhooks`                                            | List webhooks                                        | listWebhooks                   |
| `POST` | `/v1/webhooks`                                            | Create a webhook                                     | createWebhook                  |

## Field Guide

| Field  | Meaning                                                                         |
| ------ | ------------------------------------------------------------------------------- |
| Step 1 | Create or select a Knowledge Base and configure dataset defaults.               |
| Step 2 | Upload sources or configure Source Watch.                                       |
| Step 3 | Use batch job status or Knowledge Base ingest progress, then react to Webhooks. |
| Step 4 | Inspect Wiki Pages, Graph, Versions, and Knowledge Check results.               |
| Step 5 | Call Retrieve or Retrieve Expand from your application backend.                 |
| Step 6 | Resolve citation evidence when the Agent needs exact source text.               |
| Step 7 | Use forks and submissions for user-owned overlays.                              |

## Placeholder Path Checklist

Use these placeholder paths in application code examples and replace the bracketed values with real IDs:

- `POST /v1/knowledge-bases`
- `POST /v1/knowledge-bases/<knowledge_base_id>/documents`
- `GET /v1/jobs/<job_id>`
- `POST /v1/jobs/batch`
- `GET /v1/knowledge-bases/<knowledge_base_id>/ingest-progress`
- `GET /v1/knowledge-bases/<knowledge_base_id>/pages`
- `GET /v1/knowledge-bases/<knowledge_base_id>/graph`
- `POST /v1/knowledge-bases/<knowledge_base_id>/retrieve`
- `POST /v1/knowledge-bases/<knowledge_base_id>/retrieve/expand`
- `GET /v1/documents/<document_id>/evidence`
- `POST /v1/source-evidence/resolve`
- `POST /v1/source-watch-rules/<rule_id>/scan`
- `POST /v1/knowledge-bases/<knowledge_base_id>/forks/resolve`
- `POST /v1/forks/<fork_id>/submissions`
- `POST /v1/webhooks`

## MCP Tool Mapping Example

If your backend wraps FocoContext as MCP tools, use Retrieve with inline resolved evidence for the common Agent path and keep Source Evidence as the explicit dereference tool for exact quote workflows:

| MCP tool                  | OpenAPI call                                                   | Input                                                                            |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `retrieve_knowledge`      | `POST /v1/knowledge-bases/<knowledge_base_id>/retrieve`        | `query`, `top_k`, `include_context_pack`, `include_resolved_evidence`            |
| `expand_knowledge_graph`  | `POST /v1/knowledge-bases/<knowledge_base_id>/retrieve/expand` | `seed_page_ids`, `seed_edge_ids`, `depth`                                        |
| `resolve_source_evidence` | `POST /v1/source-evidence/resolve`                             | `knowledge_base_id`, `document_id`, `locator`, `media_asset_id`, `evidence_kind` |

The Agent can call Retrieve with `include_resolved_evidence: true` for bounded proof snippets, then call Source Evidence only for citations it plans to quote exactly or re-check with different limits. Pass the same canonical Knowledge Base ID or fork ID to `resolve_source_evidence.knowledge_base_id` so the raw evidence lookup uses the same visible scope as Retrieve. This keeps the prompt compact while preserving original-source traceability.

## SDK And Raw REST Paths

SDK helper path:

```ts
const upload = await client.uploadSourceDocumentsAndWait(knowledgeBaseId, {
  documents: [{ file, name: file.name, sourcePath: "docs/source" }],
});
const retrieval = await client.retrieveKnowledgeContextWithEvidence(knowledgeBaseId, {
  query: "What changed?",
  include_context_pack: true,
  include_graph: true,
});
```

Raw REST path:

1. Upload sources and read `data.resources.job_id`, `data.resources.source_document_id`, and `data.links`.
2. Call `POST /v1/jobs/batch` for uploaded job IDs and `GET /v1/knowledge-bases/{knowledge_base_id}/ingest-progress` for aggregate readiness.
3. Call Retrieve or Retrieve Expand with `include_resolved_evidence: true`.
4. Inspect cleanup through `GET /v1/cleanup-operations/{cleanup_operation_id}` and require `settled_state.is_settled` before teardown is considered complete.

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
  "/knowledge-bases/{knowledge_base_id}/documents":
    get:
      summary: "List source documents"
      operationId: "listSourceDocuments"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    post:
      summary: "Upload a source document"
      operationId: "uploadSourceDocument"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
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
  "/webhooks":
    get:
      summary: "List webhooks"
      description: "Lists webhook subscriptions with delivery readiness and latest delivery summary. Secrets are never returned."
      operationId: "listWebhooks"
      parameters:
        - name: "page"
          in: "query"
          schema:
            type: "integer"
            minimum: 1
        - name: "page_size"
          in: "query"
          schema:
            type: "integer"
            minimum: 1
            maximum: 100
      responses:
        200:
          description: "Webhook subscriptions."
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/ListEnvelope"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    post:
      summary: "Create a webhook"
      description: "Creates an enabled webhook when delivery runtime is configured. Delivery requests are signed with HMAC SHA-256 when a secret is provided."
      operationId: "createWebhook"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/WebhookCreateRequest"
            example:
              events:
                - "webhook.test"
                - "document.ingest.completed"
              knowledge_base_id: null
              secret: "replace-with-shared-secret"
              url: "https://example.com/fococontext/webhook"
      responses:
        201:
          description: "Webhook created."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/Webhook"
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
    KnowledgeBase:
      type: "object"
      required:
        - "id"
        - "name"
        - "slug"
        - "knowledge_base_type"
        - "upstream_knowledge_base_id"
        - "upstream_base_version_id"
        - "upstream_synced_version_id"
        - "fork_owner"
        - "sync_status"
        - "template"
        - "output_language"
        - "status"
        - "current_version_id"
        - "purpose"
        - "schema"
        - "retrieval"
        - "created_at"
        - "updated_at"
      properties:
        id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        name:
          type: "string"
        slug:
          type: "string"
        description:
          type: "string"
        knowledge_base_type:
          type: "string"
          enum:
            - "canonical"
            - "fork"
        upstream_knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        upstream_base_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
        upstream_synced_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
        fork_owner:
          oneOf:
            - "$ref": "#/components/schemas/ForkOwner"
            - type: "null"
        sync_status:
          type: "string"
          enum:
            - "not_applicable"
            - "synced"
            - "outdated"
            - "syncing"
            - "failed"
        current_version_id:
          "$ref": "#/components/schemas/KnowledgeVersionId"
        schema:
          type: "object"
          additionalProperties: true
        retrieval:
          type: "object"
          additionalProperties: true
        created_at:
          "$ref": "#/components/schemas/Timestamp"
        updated_at:
          "$ref": "#/components/schemas/Timestamp"
      additionalProperties: true
    SourceDocument:
      type: "object"
      required:
        - "id"
        - "knowledge_base_id"
        - "name"
        - "display_name"
        - "source_type"
        - "mime_type"
        - "size"
        - "content_hash"
        - "object_key"
        - "status"
        - "metadata"
        - "created_at"
        - "updated_at"
      properties:
        id:
          "$ref": "#/components/schemas/SourceDocumentId"
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        name:
          type: "string"
        display_name:
          type: "string"
        source_type:
          type: "string"
          enum:
            - "file"
            - "text"
            - "url"
            - "wiki_draft"
        mime_type:
          type: "string"
        size:
          type: "integer"
          minimum: 0
        content_hash:
          type: "string"
          pattern: "^sha256:[a-f0-9]{64}$"
        object_key:
          type: "string"
        status:
          type: "string"
          enum:
            - "uploaded"
            - "queued"
            - "processing"
            - "ready"
            - "failed"
            - "deleted"
        source_path:
          type: "string"
        source_url:
          type: "string"
          format: "uri"
        metadata:
          "$ref": "#/components/schemas/CommonMetadata"
        visibility_origin:
          "$ref": "#/components/schemas/VisibilityOrigin"
        owner_knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        upstream_resource_id:
          oneOf:
            - "$ref": "#/components/schemas/ResourceId"
            - type: "null"
        fork_tombstoned_at:
          oneOf:
            - "$ref": "#/components/schemas/Timestamp"
            - type: "null"
        created_at:
          "$ref": "#/components/schemas/Timestamp"
        updated_at:
          "$ref": "#/components/schemas/Timestamp"
      additionalProperties: true
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
                additionalProperties: true
              created_at:
                "$ref": "#/components/schemas/Timestamp"
            additionalProperties: true
      additionalProperties: true
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
    RetrieveRequest:
      type: "object"
      required:
        - "query"
      properties:
        query:
          type: "string"
          description: "English, Chinese, or mixed-language query. CJK terms are expanded into phrase, bigram, and single-character lexical tokens."
        mode:
          type: "string"
          enum:
            - "hybrid"
            - "keyword"
            - "semantic"
            - "graph"
        top_k:
          type: "integer"
          minimum: 1
        graph_depth:
          type: "integer"
          minimum: 0
        graph_limit_per_result:
          type: "integer"
          minimum: 1
        include_graph:
          type: "boolean"
        include_expand_hints:
          type: "boolean"
        context_budget_tokens:
          type: "integer"
          minimum: 1
        include_trace:
          type: "boolean"
        include_context_pack:
          type: "boolean"
        relation_types:
          type: "array"
          items:
            type: "string"
        page_types:
          type: "array"
          items:
            type: "string"
        source_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/SourceDocumentId"
        graph:
          type: "object"
          additionalProperties: true
        context_pack:
          type: "object"
          additionalProperties: true
      additionalProperties: true
    RetrieveResponse:
      type: "object"
      required:
        - "knowledge_base_id"
        - "results"
        - "graph_expansions"
        - "citations"
      properties:
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        target_knowledge_base_type:
          type: "string"
          enum:
            - "canonical"
            - "fork"
        visibility_summary:
          type: "object"
          properties:
            canonical:
              type: "integer"
              minimum: 0
            upstream_inherited:
              type: "integer"
              minimum: 0
            fork_owned:
              type: "integer"
              minimum: 0
          additionalProperties: false
        results:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        graph_expansions:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        citations:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        context_pack:
          oneOf:
            - "$ref": "#/components/schemas/ContextPack"
            - type: "null"
        context_budget:
          "$ref": "#/components/schemas/ContextBudget"
        trace:
          oneOf:
            - type: "object"
              additionalProperties: true
            - type: "null"
        warnings:
          type: "array"
          items:
            type: "string"
      additionalProperties: true
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
    Webhook:
      type: "object"
      required:
        - "id"
        - "url"
        - "events"
        - "status"
        - "secret_configured"
        - "delivery_backend"
      properties:
        id:
          "$ref": "#/components/schemas/WebhookId"
        knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        url:
          type: "string"
          format: "uri"
        events:
          type: "array"
          items:
            type: "string"
            enum:
              - "document.ingest.started"
              - "document.ingest.completed"
              - "document.ingest.failed"
              - "wiki_draft.created"
              - "knowledge_check.completed"
              - "page.created"
              - "page.updated"
              - "change_set.created"
              - "version.created"
              - "rollback.completed"
              - "knowledge_base.reindexed"
              - "fork.sync.completed"
              - "fork.sync.failed"
              - "cleanup.completed"
              - "cleanup.failed"
              - "retrieve.readiness.changed"
              - "webhook.test"
        status:
          type: "string"
          enum:
            - "enabled"
            - "disabled"
        secret_configured:
          type: "boolean"
        delivery_backend:
          type: "object"
          properties:
            enabled:
              type: "boolean"
            reason:
              type:
                - "string"
                - "null"
          additionalProperties: true
        latest_delivery:
          oneOf:
            - "$ref": "#/components/schemas/WebhookDelivery"
            - type: "null"
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

The main success criterion is not that a file uploaded; it is that Wiki Pages, Graph, Version, Retrieve readiness, and traceable citations are all available.

```ts
const baseUrl = "http://127.0.0.1:18080/v1";
const headers = {
  Authorization: `Bearer ${process.env.FOCOCONTEXT_API_KEY}`,
  "Content-Type": "application/json",
};

const createKb = await fetch(`${baseUrl}/knowledge-bases`, {
  method: "POST",
  headers,
  body: JSON.stringify({ name: "Product Docs", slug: "product-docs" }),
});
```

## Response Example

```json
{
  "flow": [
    "POST /v1/knowledge-bases",
    "POST /v1/knowledge-bases/<knowledge_base_id>/documents",
    "GET /v1/jobs/<job_id>",
    "GET /v1/knowledge-bases/<knowledge_base_id>/pages",
    "GET /v1/knowledge-bases/<knowledge_base_id>/graph",
    "POST /v1/knowledge-bases/<knowledge_base_id>/retrieve"
  ]
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: 'const baseUrl = "http://127.0.0.1:18080/v1"; const headers = { Authorization: `Bearer ${process.env.FOCOCONTEXT_API_KEY}`, "Content-Type": "application/json", }; const createKb = await fetch(`${baseUrl}/knowledge-bases`,'
  response:
    summary: "Response example"
    value: '{ "flow": [ "POST /v1/knowledge-bases", "POST /v1/knowledge-bases/<knowledge_base_id>/documents", "GET /v1/jobs/<job_id>", "GET /v1/knowledge-bases/<knowledge_base_id>/pages", "GET /v1/knowledge-bases/<knowledge_base_id>'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `upload_admission_rejected`: back off and retry according to your product policy.
- `retrieval_not_ready`: keep polling job/readiness or show a processing state.
- `resource_deleted`: refresh local state and remove stale UI actions.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
