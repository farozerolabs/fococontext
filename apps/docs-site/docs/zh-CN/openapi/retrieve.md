# 检索 API

> Retrieve 为你的业务后端返回以 Wiki 为中心的上下文。它可以组合词法、语义、重排、图谱、图片 caption、OCR 证据和上下文预算控制。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于为 Agent 或应用工作流接入 Wiki-centered 检索、图谱扩展、citation metadata、受限来源证据和 answerability 信号。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 当你的产品需要为 Agent、搜索结果页、回答生成器或开发工具提供可信上下文时，调用 Retrieve。
- 用户点击页面、边、洞察或来源后需要继续深入时，调用 Retrieve Expand。
- `context_pack` 适合作为紧凑的 prompt-ready 载荷；citations 用于 UI 追溯。
- Agent 需要受限来源证据内联返回时，设置 `include_resolved_evidence: true`。
- Agent 需要显式证据限制下的精确原文、OCR block 或图片 caption 时，再调用 Source Evidence。

## 端点矩阵

| 方法   | 路径                                                      | 说明                         | operationId                 |
| ------ | --------------------------------------------------------- | ---------------------------- | --------------------------- |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve`        | 检索 Wiki 知识上下文         | retrieveKnowledgeContext    |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve/expand` | 扩展已检索的 Wiki 图谱上下文 | expandRetrievedGraphContext |
| `GET`  | `/v1/documents/{document_id}/evidence`                    | 解析单个资料证据             | getSourceDocumentEvidence   |
| `POST` | `/v1/source-evidence/resolve`                             | 批量解析资料证据             | resolveSourceEvidence       |

## 原始知识库与分叉目标

Retrieve 对原始公共知识库和分叉覆盖上下文使用同一个 Knowledge Base 作用域路由。
传入 canonical Knowledge Base ID 时，读取平台维护的公共知识库；传入已解析的 fork ID
时，读取上游继承快照加该分叉自己的 fork-owned 覆盖内容。

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

响应会包含 `target_knowledge_base_type` 和 `visibility_summary`，方便客户端确认结果来自
canonical、upstream_inherited 还是 fork_owned 可见记录。

## 字段说明

| 字段                                      | 说明                                                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`                                   | 自然语言或关键词查询。中文和中英混合文本会经过词法归一化。                                                                                                                                                                                    |
| `mode`                                    | 根据配置使用 hybrid、lexical、semantic 或 graph-aware 等模式。                                                                                                                                                                                |
| `context_budget_tokens`                   | 返回上下文的上限；分配器优先保留高分页面和来源证据。                                                                                                                                                                                          |
| `include_graph`                           | 增加相关页面和关系解释。                                                                                                                                                                                                                      |
| `include_resolved_evidence`               | 给返回的 citation 增加受限 resolved evidence 或 item-level evidence error。                                                                                                                                                                   |
| `include_trace`                           | 返回安全的阶段诊断，包括词法召回、metadata matching、语义召回、排序融合、可选 rerank、图谱扩展、上下文预算和上下文剪枝。                                                                                                                      |
| `min_answer_confidence`                   | 可选 `0..1` 阈值，用于决定 Retrieve 何时把上下文标记为 `answerable`。默认 `0.6`。                                                                                                                                                             |
| `strict_evidence`                         | 要求具备可追溯 citation 证据后，`answerability.status` 才能变为 `answerable`。                                                                                                                                                                |
| `no_answer_behavior`                      | `diagnostic_results` 保留受限诊断候选；`empty_results` 在无答案时清空候选数组。                                                                                                                                                               |
| `answerability.status`                    | 基于通用检索、引用、图谱、warning 和 context pack 信号返回 `answerable`、`partial` 或 `not_answerable`。                                                                                                                                      |
| `answerability.no_answer`                 | 为 true 时，客户端需要更强证据后再生成带来源背书的最终回答。                                                                                                                                                                                  |
| `answerability.recommended_action`        | 面向 Agent 的推荐动作，例如 `answer_with_citations`、`answer_with_caveat`、`ask_clarifying_question`、`relax_filters` 或 `retry_after_ingest`。                                                                                               |
| `results[].display_metadata`              | 用于结果理解和重复标题消歧的受限展示 metadata。它会排除 raw internal metadata、secret、signed URL、storage key、部署路径和无界嵌套对象。                                                                                                      |
| `graph_readiness.state`                   | 当前知识库的物化图谱洞察状态：`queued`、`updating`、`ready`、`failed`、`partial` 或 `stale`。非 `ready` 状态也会以 `graph.readiness.<state>` 进入请求级 warnings。                                                                            |
| `trace.stages[].output.duration_ms`       | API 侧记录的阶段耗时，用于安全延迟排查。                                                                                                                                                                                                      |
| `trace.stages[].output.store`             | 检索所走的后端路径，例如 PostgreSQL lexical search、pgvector semantic search、indexed graph traversal、Redis cache 或 bounded source-evidence lookup。                                                                                        |
| `trace.stages[].output.query_path`        | 阶段执行路径摘要，例如 optimized bounded retrieval、indexed graph expansion 或 cache-backed materialized insight lookup。                                                                                                                     |
| `trace.stages[].output.cache_status`      | 阶段可报告时返回的 cache 行为摘要，例如 hit、miss、bypass 或 unavailable。                                                                                                                                                                    |
| `trace.stages[].output.input_count`       | 排序、图谱或上下文阶段可报告时返回的受限输入数量。                                                                                                                                                                                            |
| `trace.stages[].output.output_count`      | 阶段返回的受限输出数量。                                                                                                                                                                                                                      |
| `trace.stages[].output.warning_codes`     | 阶段局部 warning code，包括索引就绪状态和图谱扩展限制。                                                                                                                                                                                       |
| `trace.stages[name=rerank].output.status` | 通过 trace 查看 rerank 时，返回 `disabled`、`skipped`、`applied`、`failed` 或 `timed_out`。                                                                                                                                                   |
| `trace.stages[name=answerability]`        | 安全的可回答性贡献摘要、阈值、证据计数、原因代码和推荐动作。                                                                                                                                                                                  |
| `context_budget.omitted_items[].reason`   | 说明某个上下文为何未进入 `context_pack`，包括 `budget_exhausted`、`duplicate_context`、`duplicate_source_noise`、`graph_neighbor_after_source_evidence`、`lower_source_match` 和 `missing_locator_evidence`。                                 |
| 图片证据                                  | 如果已有 caption，citation 可以包含媒体和原图预览引用。                                                                                                                                                                                       |
| `locator_status`                          | 每个 citation 和 media evidence 都会返回的 Source Evidence 定位状态。只有 `resolved` 才能作为精确引用。                                                                                                                                       |
| `warnings`                                | 请求级非致命 warning code，例如 `retrieve.index.semantic_not_ready`、`retrieve.index.semantic_unavailable`、`retrieve.rerank_failed`、`retrieve.rerank_timed_out` 或 `graph.readiness.stale`。空 env 禁用 rerank 会通过 trace metadata 呈现。 |
| `warning_codes`                           | citation 级机器可读的非精确、缺失、不支持或降级定位原因。                                                                                                                                                                                     |

## 图谱就绪与 Trace 字段

Retrieve 可以在图谱洞察仍在物化时返回可用的 Wiki 结果。使用图谱扩展和洞察信号前，应先查看 `graph_readiness.state`。`ready` 表示当前物化图谱洞察快照可用。`queued` 和 `updating` 表示后台任务正在处理。`partial`、`stale` 和 `failed` 表示直接检索结果仍可使用，依赖图谱的 UI 或 Agent 行为应展示限定说明、稍后重试，或回退到 citation-backed results。

`include_trace` 为 true 时，trace stages 会返回安全的优化路径诊断。用 `duration_ms`、`store`、`query_path`、`cache_status`、`input_count`、`output_count` 和 `warning_codes` 排查大知识库运行情况，无需读取私有行或原始来源内容。Trace 字段属于诊断 metadata，后续可以扩展；客户端主逻辑应优先基于已文档化 warning code 和主响应字段判断。

生产 Retrieve 和 Retrieve Expand 不会静默回退到全量内存扫描。有界检索、图谱索引、Redis cache state 或来源证据后端不可用时，客户端会收到类型化 warning 或类型化错误，例如 `bounded_retrieval_unavailable`、`graph_index_unavailable`、`durable_backend_unavailable` 或 `retrieve_index_not_ready`。

## Agent 无答案处理

Retrieve 不生成最终回答。应用和 Agent 应先根据 `answerability` 分支，再使用返回的 Wiki 上下文：

- `answerable`：可以带 citation 或 resolved evidence 回答。
- `partial`：只有问题范围被证据覆盖时才带限定条件回答，否则追问。
- `not_answerable`：应追问、放宽过滤、等待入库就绪或拒绝无证据结论。

示例：

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

## Citation 解引用流程

Retrieve 和 Retrieve Expand 返回以 Wiki 为中心的上下文，同时保留 `document_id`、`locator`、`locator_status`、`warning_codes`、`media_asset_id` 和 `evidence_kind` 等 citation metadata。`context_pack` 只承载受控上下文。当 `include_resolved_evidence` 为 true 时，响应可以按同一套 Source Evidence 精确性规则附带受限 resolved evidence 或 item-level evidence error。

`locator` 可以是 `line:42`、`line:42-44` 这类 parser locator、`source_markdown`、`source_markdown:42`、`source_markdown:42-44` 这类模型 locator、`ocr:page:1:block:0`、`page:1:0`、`page:1;block:0`、`page=1:block=0`、`page=1; block_index=0` 或 `page:1;block:0-6` 这类 OCR locator，也可以是模型返回的 source-ref 文本锚点。Source Evidence 可以把 `SECTION-101,SECTION-102` 这类逗号分隔文本锚点解析成覆盖两个锚点的受限原文范围。

Agent 需要带显式限制的原始来源片段、OCR block 或图片 caption 时，单独调用 Source Evidence：

```bash
curl -sS "$FOCOCONTEXT_BASE_URL/v1/source-evidence/resolve" \
  -H "Authorization: Bearer $FOCOCONTEXT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"knowledge_base_id":"'"$TARGET_KB_OR_FORK_ID"'","document_id":"doc_example","locator":"line:42","evidence_kind":"text"}]}'
```

`knowledge_base_id` 要传入和 Retrieve 相同的 canonical Knowledge Base ID 或 fork ID。
Source Evidence 会校验该 Source Document 在这个 scope 下可见，返回
`visibility_origin`、`owner_knowledge_base_id` 和 `upstream_resource_id`，并拒绝其他
fork 的 citation。

精确引用时保持 `allow_fallback` 未设置。若 `locator_status` 不是 `resolved`，展示 warning，或让 Agent 引用编译后的 Wiki 页面。

当检索结果包含 `media_evidence` 时，应把它视为受限的图片 caption 证据。先用返回的 `media_asset_id` 调用 Source Evidence 获取 caption 状态和结构化 locator metadata；只有需要查看原始视觉内容时，再调用 preview endpoint。PDF snapshot、PDF embedded image、Office 图片、表格视觉内容以及 Markdown/HTML 图片都使用同一流程。

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

## 请求示例

入库任务完成后再调用 Retrieve。如果 embedding 尚未就绪，词法和图谱信号仍可提供部分能力并返回 warnings。

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/retrieve" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "异步资料清理如何工作？",
    "top_k": 5,
    "include_graph": true,
    "include_context_pack": true,
    "context_budget_tokens": 4000
  }'
```

## 响应示例

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

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/retrieve\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"query\": \"异步资料清理如何工作？\", \"top_k\": 5, \""
  response:
    summary: "响应示例"
    value: '{ "data": { "results": [ { "page_id": "page_01HX2YA2BC3D4E5F6G7H8J9K0M", "title": "Async source cleanup", "score": 0.91, "citations": [ { "document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "evidence_kind": "text", "locator'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `409 retrieval_not_ready`：还没有可检索的 Wiki 上下文。
- `400 context_budget_exceeded`：请求的预算超过服务配置。
- `400 invalid_retrieve_expand_seed`：扩展入口页面或边不合法。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
