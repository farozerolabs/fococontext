# Retrieve API

> Retrieve returns Wiki-centered context for your application backend. It can combine lexical, semantic, rerank, graph, image caption, OCR evidence, and context budget controls.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page when your backend needs Wiki-centered retrieval, graph expansion, citation metadata, bounded source evidence, and answerability signals for an Agent or application workflow.

## When to Use This Page

- Use Retrieve when your product needs grounded context for an Agent, search result page, answer composer, or developer tool.
- Use Retrieve Expand when a user clicks a page, edge, insight, or source and wants deeper adjacent context.
- Use `context_pack` as the compact prompt-ready payload, while keeping citations for UI traceability.
- Set `include_resolved_evidence: true` when an Agent needs bounded source proof inline.
- Use Source Evidence after Retrieve when an Agent needs exact original text, OCR blocks, or image captions for a citation with explicit limits.

## Endpoint Matrix

| Method | Path                                                      | Summary                                | operationId                 |
| ------ | --------------------------------------------------------- | -------------------------------------- | --------------------------- |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve`        | Retrieve wiki-based knowledge context  | retrieveKnowledgeContext    |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve/expand` | Expand retrieved wiki graph context    | expandRetrievedGraphContext |
| `GET`  | `/v1/documents/{document_id}/evidence`                    | Resolve source evidence for a document | getSourceDocumentEvidence   |
| `POST` | `/v1/source-evidence/resolve`                             | Resolve source evidence in batch       | resolveSourceEvidence       |

## Canonical and Fork Targets

Retrieve uses one Knowledge Base-scoped route for both shared knowledge and fork
overlays. Pass the canonical Knowledge Base ID when your application should read
the platform-managed knowledge base. Pass a resolved fork ID when your
application should read the upstream inherited snapshot plus that fork's
fork-owned overlay.

```bash
curl -sS "$FOCOCONTEXT_BASE_URL/v1/knowledge-bases/$CANONICAL_KB_ID/retrieve" \
  -H "Authorization: Bearer $FOCOCONTEXT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"runtime limits","mode":"hybrid","include_context_pack":true}'

curl -sS "$FOCOCONTEXT_BASE_URL/v1/knowledge-bases/$FORK_KB_ID/retrieve" \
  -H "Authorization: Bearer $FOCOCONTEXT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"user-specific runtime limits","mode":"hybrid","include_context_pack":true}'
```

Responses include `target_knowledge_base_type` and `visibility_summary` so your
client can confirm whether the result came from canonical records,
upstream-inherited fork records, or fork-owned overlay records.

## Field Guide

| Field                                     | Meaning                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`                                   | Natural language or keyword query. CJK and mixed-language text are normalized for lexical retrieval.                                                                                                                                                                        |
| `mode`                                    | Retrieval mode such as hybrid, lexical, semantic, or graph-aware depending on configuration.                                                                                                                                                                                |
| `context_budget_tokens`                   | Upper bound for returned context. The allocator prioritizes high-score pages and source evidence.                                                                                                                                                                           |
| `include_graph`                           | Adds related pages and relationship explanations.                                                                                                                                                                                                                           |
| `include_resolved_evidence`               | Adds bounded resolved evidence or item-level evidence errors to returned citations.                                                                                                                                                                                         |
| `include_trace`                           | Adds safe stage diagnostics for keyword retrieval, metadata matching, semantic retrieval, rank fusion, optional rerank, graph expansion, context budget, and context pruning.                                                                                               |
| `min_answer_confidence`                   | Optional `0..1` threshold used before Retrieve marks context as `answerable`. Defaults to `0.6`.                                                                                                                                                                            |
| `strict_evidence`                         | Requires source-traceable citation evidence before `answerability.status` can become `answerable`.                                                                                                                                                                          |
| `no_answer_behavior`                      | `diagnostic_results` keeps bounded candidates for debugging; `empty_results` clears candidate arrays when no answer is available.                                                                                                                                           |
| `answerability.status`                    | `answerable`, `partial`, or `not_answerable` based on generic retrieval, citation, graph, warning, and context-pack signals.                                                                                                                                                |
| `answerability.no_answer`                 | When true, clients need stronger evidence before producing a source-backed final answer.                                                                                                                                                                                    |
| `answerability.recommended_action`        | Agent-friendly action such as `answer_with_citations`, `answer_with_caveat`, `ask_clarifying_question`, `relax_filters`, or `retry_after_ingest`.                                                                                                                           |
| `results[].display_metadata`              | Bounded curated metadata for result interpretation and duplicate-title disambiguation. It excludes raw internal metadata, secrets, signed URLs, storage keys, deployment paths, and unbounded nested objects.                                                               |
| `graph_readiness.state`                   | Materialized graph insight state for this Knowledge Base: `queued`, `updating`, `ready`, `failed`, `partial`, or `stale`. Non-`ready` states also appear in request warnings as `graph.readiness.<state>`.                                                                  |
| `trace.stages[].output.duration_ms`       | Stage runtime measured by the API for safe latency debugging.                                                                                                                                                                                                               |
| `trace.stages[].output.store`             | Retrieval backing path such as bounded database reads or in-memory fallback for local development.                                                                                                                                                                          |
| `trace.stages[].output.query_path`        | High-level execution path for the stage, for example optimized bounded retrieval versus local fallback.                                                                                                                                                                     |
| `trace.stages[].output.cache_status`      | Cache behavior summary such as hit, miss, bypass, or unavailable when the stage can report it.                                                                                                                                                                              |
| `trace.stages[].output.input_count`       | Bounded input count used by ranking, graph, or context stages when available.                                                                                                                                                                                               |
| `trace.stages[].output.output_count`      | Bounded output count returned by the stage.                                                                                                                                                                                                                                 |
| `trace.stages[].output.warning_codes`     | Stage-local warning codes, including index readiness and graph expansion limits.                                                                                                                                                                                            |
| `trace.stages[name=rerank].output.status` | Reports `disabled`, `skipped`, `applied`, `failed`, or `timed_out` when rerank is inspected through the trace.                                                                                                                                                              |
| `trace.stages[name=answerability]`        | Safe answerability contribution summary, thresholds, evidence counts, reason codes, and recommended action.                                                                                                                                                                 |
| `context_budget.omitted_items[].reason`   | Explains why context was not packed, including `budget_exhausted`, `duplicate_context`, `duplicate_source_noise`, `graph_neighbor_after_source_evidence`, `lower_source_match`, and `missing_locator_evidence`.                                                             |
| `image evidence`                          | Captioned media and original preview references can appear in citations when available.                                                                                                                                                                                     |
| `locator_status`                          | Source Evidence status returned on each citation and media evidence item. Use returned text as an exact quote only when it is `resolved`.                                                                                                                                   |
| `warnings`                                | Request-level non-fatal warning codes such as `retrieve.index.semantic_not_ready`, `retrieve.index.semantic_unavailable`, `retrieve.rerank_failed`, `retrieve.rerank_timed_out`, or `graph.readiness.stale`. Empty-env rerank disablement is trace metadata, not a warning. |
| `warning_codes`                           | Citation-level machine-readable reasons for non-exact, missing, unsupported, or downgraded locators.                                                                                                                                                                        |

## Graph Readiness and Trace Fields

Retrieve can return useful Wiki results while graph insights are still being materialized. Check `graph_readiness.state` before treating graph expansion and insight signals as complete. `ready` means the materialized graph insight snapshot is current. `queued` and `updating` mean background work is in progress. `partial`, `stale`, and `failed` mean the response remains usable for direct retrieval, while graph-dependent UI or Agent behavior should show a caveat, retry later, or fall back to citation-backed results.

When `include_trace` is true, trace stages expose safe optimized-path diagnostics. Use `duration_ms`, `store`, `query_path`, `cache_status`, `input_count`, `output_count`, and `warning_codes` to debug large Knowledge Bases without reading private rows or raw source content. Trace fields are diagnostic metadata and can grow over time; client logic should branch on documented warning codes and primary response fields first.

## Agent No-Answer Handling

Retrieve returns context for final answers. Applications and Agents should branch on `answerability` before using the returned Wiki context:

- `answerable`: answer with citations or resolved evidence.
- `partial`: answer with caveats only when the scope is covered, or ask a clarifying question.
- `not_answerable`: ask a clarifying question, relax filters, wait for ingest readiness, or refuse unsupported claims.

Example:

```ts
const retrieval = await client.retrieveKnowledgeContext(knowledgeBaseId, {
  query: "What changed in the retention policy?",
  include_context_pack: true,
  include_resolved_evidence: true,
  strict_evidence: true,
});

if (retrieval.answerability.no_answer) {
  return {
    action: retrieval.answerability.recommended_action,
    reason_codes: retrieval.answerability.reason_codes,
  };
}
```

## Citation Dereference Flow

Retrieve and Retrieve Expand return Wiki-centered context plus citation metadata such as `document_id`, `locator`, `locator_status`, `warning_codes`, `media_asset_id`, and `evidence_kind`. They avoid inlining unbounded raw source text into `context_pack`. When `include_resolved_evidence` is true, they can attach bounded resolved evidence or item-level evidence errors using the same Source Evidence exactness rules.

`locator` may be a parser locator such as `line:42` or `line:42-44`, a model locator such as `source_markdown`, `source_markdown:42`, or `source_markdown:42-44`, an OCR locator such as `ocr:page:1:block:0`, `page:1:0`, `page:1;block:0`, `page=1:block=0`, `page=1; block_index=0`, or `page:1;block:0-6`, or a source-ref text anchor from the model. Source Evidence can resolve comma-separated text anchors such as `SECTION-101,SECTION-102` into the bounded source span that covers both anchors.

When the Agent needs the original source passage, OCR block, or image caption with explicit evidence limits, call Source Evidence separately:

```bash
curl -sS "$FOCOCONTEXT_BASE_URL/v1/source-evidence/resolve" \
  -H "Authorization: Bearer $FOCOCONTEXT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"knowledge_base_id":"'"$TARGET_KB_OR_FORK_ID"'","document_id":"doc_example","locator":"line:42","evidence_kind":"text"}]}'
```

Pass the same canonical Knowledge Base ID or fork ID used by Retrieve as
`knowledge_base_id`. Source Evidence validates that the source document is
visible in that scope, returns `visibility_origin`, `owner_knowledge_base_id`,
and `upstream_resource_id`, and rejects citations from other forks.

Keep `allow_fallback` unset for exact quotes. If `locator_status` is not `resolved`, show the warning or ask the Agent to cite the compiled Wiki page instead.

When a retrieved result includes `media_evidence`, treat it as bounded image-caption evidence. Use the returned `media_asset_id` with Source Evidence to get caption status and structured locator metadata, then call the preview endpoint only when the original visual needs to be inspected. This flow is the same for PDF snapshots, PDF embedded images, Office images, spreadsheet visuals, and Markdown/HTML images.

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
              include_resolved_evidence: true
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
  "/knowledge-bases/{knowledge_base_id}/retrieve/expand":
    post:
      summary: "Expand retrieved wiki graph context"
      description: "Expands from seed Wiki Pages into graph-linked context while preserving relation reasons and source traceability."
      operationId: "expandRetrievedGraphContext"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/RetrieveExpandRequest"
            example:
              context_budget_tokens: 2000
              depth: 1
              include_context_pack: true
              seed_page_ids:
                - "page_example"
      responses:
        200:
          description: "Retrieve graph expansion result."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/RetrieveExpandResponse"
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
            properties:
              display_metadata:
                type: "object"
                description: "Bounded curated metadata for Agent and developer interpretation. Raw internal metadata, secrets, signed URLs, storage keys, deployment paths, and unbounded nested objects are excluded."
                additionalProperties:
                  oneOf:
                    - type: "string"
                    - type: "number"
                    - type: "boolean"
                    - type: "array"
                      items:
                        type: "string"
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
              description: "Safe retrieval trace metadata. Stage names include query_normalization, keyword_retrieval, metadata_matching, semantic_retrieval, rank_fusion, rerank, graph_expansion, context_budget, context_pruning, citation_selection, and final_packing when available."
              additionalProperties: true
            - type: "null"
        warnings:
          type: "array"
          description: "Stable non-fatal warning codes. Index warnings include retrieve.index.semantic_not_ready. Rerank warnings include retrieve.rerank_failed and retrieve.rerank_timed_out; disabled or skipped rerank states are reported through trace metadata."
          items:
            type: "string"
      additionalProperties: true
    RetrieveExpandRequest:
      type: "object"
      required:
        - "seed_page_ids"
      properties:
        seed_page_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/WikiPageId"
        depth:
          type: "integer"
          minimum: 1
        seed_edge_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphEdgeId"
        relation_types:
          type: "array"
          items:
            type: "string"
        exclude_page_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/WikiPageId"
        include_context_pack:
          type: "boolean"
        context_budget_tokens:
          type: "integer"
          minimum: 1
      additionalProperties: true
    RetrieveExpandResponse:
      type: "object"
      required:
        - "knowledge_base_id"
        - "expanded_results"
        - "nodes"
        - "edges"
        - "context_pack_delta"
        - "next_expansion"
      properties:
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        expanded_results:
          type: "array"
          items:
            type: "object"
            properties:
              display_metadata:
                type: "object"
                additionalProperties: true
            additionalProperties: true
        nodes:
          type: "array"
          items:
            type: "object"
            properties:
              display_metadata:
                type: "object"
                additionalProperties: true
            additionalProperties: true
        edges:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        context_pack_delta:
          oneOf:
            - "$ref": "#/components/schemas/ContextPack"
            - type: "null"
        next_expansion:
          type: "object"
          additionalProperties: true
      additionalProperties: true
    ContextBudget:
      type:
        - "object"
        - "null"
      properties:
        total_tokens_estimated:
          type: "integer"
          minimum: 0
        total_budget_tokens:
          type: "integer"
          minimum: 0
        used_tokens:
          type: "integer"
          minimum: 0
        categories:
          type: "object"
          additionalProperties: true
        omitted_items:
          type: "array"
          items:
            type: "object"
            required:
              - "category"
              - "resource_type"
              - "resource_id"
              - "estimated_tokens"
              - "reason"
            properties:
              category:
                type: "string"
                enum:
                  - "system_pages"
                  - "direct_hits"
                  - "graph_expansions"
                  - "citations"
                  - "media_evidence"
                  - "metadata"
              resource_type:
                type: "string"
                enum:
                  - "page"
                  - "section"
                  - "edge"
                  - "citation"
                  - "media_asset"
                  - "metadata"
              resource_id:
                type: "string"
              estimated_tokens:
                type: "integer"
                minimum: 0
              reason:
                type: "string"
                enum:
                  - "budget_exhausted"
                  - "duplicate_context"
                  - "duplicate_source_noise"
                  - "graph_neighbor_after_source_evidence"
                  - "lower_source_match"
                  - "missing_locator_evidence"
            additionalProperties: false
        truncated_categories:
          type: "array"
          items:
            type: "string"
        truncated:
          type: "boolean"
        strategy_version:
          type: "string"
      additionalProperties: true
    ContextPack:
      type: "object"
      required:
        - "format"
        - "content"
        - "entries"
        - "budget_tokens"
        - "used_tokens"
        - "included_page_ids"
      properties:
        format:
          type: "string"
          enum:
            - "markdown"
        content:
          type: "string"
        budget_tokens:
          type: "integer"
        used_tokens:
          type: "integer"
        entries:
          type: "array"
          items:
            type: "object"
            required:
              - "section_id"
              - "category"
              - "resource_type"
              - "resource_id"
            properties:
              section_id:
                type: "string"
              category:
                type: "string"
              resource_type:
                type: "string"
              resource_id:
                type: "string"
              page_id:
                "$ref": "#/components/schemas/WikiPageId"
              page_version_id:
                "$ref": "#/components/schemas/PageVersionId"
              visibility_origin:
                "$ref": "#/components/schemas/VisibilityOrigin"
            additionalProperties: true
        included_page_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/WikiPageId"
        included_page_version_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/PageVersionId"
        included_section_ids:
          type: "array"
          items:
            type: "string"
        citations:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
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

Do not call Retrieve before the ingest job completes. If embeddings are not ready, lexical and graph signals can still provide partial behavior with warnings.

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/retrieve" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does async source cleanup work?",
    "top_k": 5,
    "include_graph": true,
    "include_context_pack": true,
    "context_budget_tokens": 4000
  }'
```

## Response Example

```json
{
  "data": {
    "results": [
      {
        "page_id": "page_01HX2YA2BC3D4E5F6G7H8J9K0M",
        "title": "Async source cleanup",
        "score": 0.91,
        "citations": [
          {
            "document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2",
            "evidence_kind": "text",
            "locator": "page:3"
          }
        ]
      }
    ],
    "context_pack": {
      "budget_tokens": 4000,
      "used_tokens": 1240
    }
  },
  "request_id": "req_retrieve"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/retrieve\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"query\": \"How does async source clean"
  response:
    summary: "Response example"
    value: '{ "data": { "results": [ { "page_id": "page_01HX2YA2BC3D4E5F6G7H8J9K0M", "title": "Async source cleanup", "score": 0.91, "citations": [ { "document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "evidence_kind": "text", "locator'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `409 retrieval_not_ready`: no indexed Wiki context is available yet.
- `400 context_budget_exceeded`: requested budget exceeds server configuration.
- `400 invalid_retrieve_expand_seed`: expand seed page or edge is invalid.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
