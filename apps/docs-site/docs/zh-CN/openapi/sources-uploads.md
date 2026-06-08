# 资料与上传 API

> Source Document 是证据输入。上传会创建 Source Document 和异步 Ingest Job；检索结果以生成后的 Wiki 页面为中心。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于上传文件、创建直链上传 session、查看解析结果、解析来源证据，以及重试 OCR 和 caption 任务。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 普通文件使用 multipart upload，大文件使用 upload session 直传对象存储。
- 你的后端已有规范化文本或 URL 时，使用 text source 和 URL source 接口。
- 排查资料问题时，使用 parsed content、media assets、OCR retry 和 caption retry 接口。
- Retrieve citation 需要解引用到受限原文、OCR 文本或图片 caption 时，使用 Source Evidence 接口。
- 上传后使用 batch job status 或 Knowledge Base ingest progress，不需要为每个文件单独轮询一个 job 接口。

## 端点矩阵

| 方法     | 路径                                                                                             | 说明                           | operationId                    |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------ |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/documents`                                              | 列出资料文档                   | listSourceDocuments            |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents`                                              | 上传资料文档                   | uploadSourceDocument           |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/text`                                         | 创建文本资料文档               | createTextSourceDocument       |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/url`                                          | 创建 URL 资料文档              | createUrlSourceDocument        |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/upload-sessions`                              | 创建直传上传会话               | createSourceUploadSession      |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/upload-sessions/{upload_session_id}/finalize` | 完成直传上传会话               | finalizeSourceUploadSession    |
| `POST`   | `/v1/jobs/batch`                                                                                 | 批量查询入库任务状态           | getIngestJobStatuses           |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/ingest-progress`                                        | 获取聚合入库进度和检索就绪状态 | getKnowledgeBaseIngestProgress |
| `GET`    | `/v1/documents/{document_id}`                                                                    | 获取资料文档                   | getSourceDocument              |
| `DELETE` | `/v1/documents/{document_id}`                                                                    | 通过资料生命周期删除资料文档   | deleteSourceDocument           |
| `GET`    | `/v1/documents/{document_id}/parsed-content`                                                     | 获取资料解析内容               | getSourceDocumentParsedContent |
| `GET`    | `/v1/documents/{document_id}/evidence`                                                           | 解析单个资料证据               | getSourceDocumentEvidence      |
| `GET`    | `/v1/documents/{document_id}/media-assets`                                                       | 列出资料媒体资产               | listSourceDocumentMediaAssets  |
| `POST`   | `/v1/source-evidence/resolve`                                                                    | 批量解析资料证据               | resolveSourceEvidence          |
| `GET`    | `/v1/media-assets/{media_asset_id}/preview`                                                      | 获取媒体资产预览元数据         | getMediaAssetPreview           |
| `POST`   | `/v1/media-assets/{media_asset_id}/caption/retry`                                                | 重试媒体资产 caption           | retryMediaAssetCaption         |
| `POST`   | `/v1/documents/{document_id}/ocr/retry`                                                          | 重试或重新处理资料 OCR         | retrySourceDocumentOcr         |
| `POST`   | `/v1/documents/{document_id}/delete-preview`                                                     | 预览资料删除影响               | previewSourceDeletionImpact    |
| `POST`   | `/v1/documents/{document_id}/reingest`                                                           | 重新入库资料文档               | reingestSourceDocument         |

## 字段说明

| 字段              | 说明                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `archive_path`    | 管理后台用于组织资料的虚拟目录，可独立于真实本地文件路径。                                |
| `metadata_labels` | 元数据标签，用于过滤和来源归因。                                                          |
| `object_key`      | 服务端生成的存储 key，包含唯一性保护；展示名称应使用原始文件名字段。                      |
| `content_hash`    | 上传内容哈希，用于追踪和重复检测。                                                        |
| `job_id`          | 用这个任务 ID 轮询入库进度，直到完成、失败或取消。                                        |
| `resources`       | 上传响应对象，包含 `knowledge_base_id`、`source_document_id` 和 `job_id`。                |
| `links`           | 机器可读下一步动作，例如 job detail、source document detail、ingest progress 和文档入口。 |
| `locator_status`  | Source Evidence 定位状态。只有该值为 `resolved` 时，返回文本才可作为精确引用。            |

## Source Evidence 解引用

`GET /v1/documents/{document_id}/parsed-content` 是诊断预览，可能被截断。Agent citation 解引用应使用 Source Evidence。

单个 citation 使用 `GET /v1/documents/{document_id}/evidence`；有序批量 citation 使用 `POST /v1/source-evidence/resolve`；Agent 需要内联受限证据时，可以在 Retrieve 和 Retrieve Expand 中设置 `include_resolved_evidence: true`。请求支持 `knowledge_base_id`、`locator`、`media_asset_id`、`evidence_kind`、`max_chars`、`context_chars` 和显式 `allow_fallback`。

文本 locator 可以是 `line:12`、`line:12-14` 这类 parser locator、`source_markdown`、`source_markdown:12`、`source_markdown:12-14` 这类模型 locator，也可以是 Retrieve 返回的 source-ref 锚点。OCR locator 可以使用 `ocr:page:1:block:0`、`page:1:0`、`page:1;block:0`、`page=1:block=0`、`page=1; block_index=0`，也可以使用 `page:1;block:0-6` 这类 block 范围。当模型返回 `SECTION-101,SECTION-102` 这类逗号分隔文本锚点时，Source Evidence 会解析覆盖这些命中锚点的原文范围。

Agent 或 MCP 集成需要把 Retrieve 使用的 canonical Knowledge Base ID 或 fork ID 原样传给 `knowledge_base_id`。这样证据解引用会限定在 canonical source、upstream inherited fork source 和当前 fork-owned overlay 内，并拒绝其他 forks。

默认限制为 `max_chars=4000`、`context_chars=800`、批量 `20` 条、批量总输出 `40000` 字符。单条最大值为 `max_chars=12000` 和 `context_chars=2000`。

## 跨格式 Media Assets

PDF、DOCX、PPTX、表格、Markdown 和 HTML 中的文档来源视觉内容都使用同一个 Media Asset contract。Media Asset locator 包含 `source_format`、`asset_kind`、`extraction_method`，并在可用时补充 `page_number`、`slide_number`、`sheet_name`、`source_path`、`source_url` 或 `image_index` 等格式字段。

PDF 视觉抽取可以产出 embedded images 和受限的低文本页面 snapshots。OCR 仍然是独立证据面：OCR blocks 是文本证据，`image_caption` 是对 Media Asset 生成的事实描述。Markdown 和 HTML 远程图片默认跳过，只有部署明确开启安全远程抓取策略时才会处理。

Agent 应使用 `/v1/documents/{document_id}/media-assets` 列出资产，使用 `/v1/source-evidence/resolve` 解引用 `image_caption` citation，只有需要受控查看原图时再调用 `/v1/media-assets/{media_asset_id}/preview`。

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
  "/knowledge-bases/{knowledge_base_id}/documents/text":
    post:
      summary: "Create a text source document"
      operationId: "createTextSourceDocument"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/documents/url":
    post:
      summary: "Create a URL source document"
      operationId: "createUrlSourceDocument"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/documents/upload-sessions":
    post:
      summary: "Create a direct upload session"
      description: "Creates a short-lived direct upload session and returns a presigned object-storage PUT URL. Use this path for files above the configured direct-upload threshold."
      operationId: "createSourceUploadSession"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/CreateUploadSessionRequest"
      responses:
        201:
          description: "Direct upload session created."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/CreateUploadSessionResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/documents/upload-sessions/{upload_session_id}/finalize":
    post:
      summary: "Finalize a direct upload session"
      description: "Verifies the uploaded object and creates the Source Document plus initial ingest Job."
      operationId: "finalizeSourceUploadSession"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/FinalizeUploadSessionRequest"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/documents/{document_id}":
    get:
      summary: "Get a source document"
      operationId: "getSourceDocument"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    delete:
      summary: "Delete a source document through source lifecycle"
      operationId: "deleteSourceDocument"
      responses:
        200:
          description: "Source Document deletion accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/AsyncDeleteResponse"
  "/documents/{document_id}/parsed-content":
    get:
      summary: "Get source document parsed content"
      operationId: "getSourceDocumentParsedContent"
      responses:
        200:
          description: "Parsed Content detail."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ParsedContent"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/documents/{document_id}/evidence":
    get:
      summary: "Resolve source evidence for a document"
      description: "Dereferences a single Retrieve or Retrieve Expand citation into bounded source evidence. Pass knowledge_base_id to enforce the same canonical or fork-visible scope as Retrieve."
      operationId: "getSourceDocumentEvidence"
      responses:
        200:
          description: "Source evidence excerpt."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/SourceEvidenceResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/documents/{document_id}/media-assets":
    get:
      summary: "List source document media assets"
      description: "Lists extracted media assets and caption metadata. Caption fields are additive and safe for developer API use."
      operationId: "listSourceDocumentMediaAssets"
      responses:
        200:
          description: "Source document media assets."
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
                          "$ref": "#/components/schemas/MediaAsset"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/source-evidence/resolve":
    post:
      summary: "Resolve source evidence in batch"
      description: "Resolves ordered bounded source evidence items from Retrieve and Retrieve Expand citations. Each item can include knowledge_base_id to preserve canonical or fork-visible scope."
      operationId: "resolveSourceEvidence"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/SourceEvidenceBatchRequest"
      responses:
        200:
          description: "Ordered source evidence resolution results."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/SourceEvidenceBatchResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/media-assets/{media_asset_id}/preview":
    get:
      summary: "Get media asset preview metadata"
      operationId: "getMediaAssetPreview"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/media-assets/{media_asset_id}/caption/retry":
    post:
      summary: "Retry media asset caption"
      description: "Retries a failed media asset caption through the server-side `media.caption` queue and returns the durable ingest job. Use `Authorization: Bearer <FOCOCONTEXT_API_KEY>`."
      operationId: "retryMediaAssetCaption"
      responses:
        202:
          description: "Caption retry accepted."
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
                  stage: "captioning"
                  progress: 35
                request_id: "req_example"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/documents/{document_id}/ocr/retry":
    post:
      summary: "Retry or reprocess source document OCR"
      description: "Schedules OCR retry or reprocess for eligible PDF pages and returns the durable ingest job."
      operationId: "retrySourceDocumentOcr"
      requestBody:
        required: false
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/OcrRetryRequest"
      responses:
        202:
          description: "OCR retry accepted."
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
                  stage: "ocr"
                  progress: 20
                request_id: "req_example"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/documents/{document_id}/delete-preview":
    post:
      summary: "Preview source deletion impact"
      operationId: "previewSourceDeletionImpact"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/documents/{document_id}/reingest":
    post:
      summary: "Re-ingest a source document"
      operationId: "reingestSourceDocument"
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
    ParsedContent:
      type: "object"
      required:
        - "id"
        - "document_id"
        - "normalized_markdown_object_key"
        - "captioned_markdown_object_key"
        - "markdown_preview"
        - "markdown_preview_object_key"
        - "markdown_preview_truncated"
      properties:
        id:
          "$ref": "#/components/schemas/ParsedContentId"
        document_id:
          "$ref": "#/components/schemas/SourceDocumentId"
        normalized_markdown_object_key:
          type: "string"
          description: "Immutable parser-normalized Markdown object key."
        captioned_markdown_object_key:
          type:
            - "string"
            - "null"
          description: "Caption-enriched compile artifact object key. This does not replace normalized Markdown."
        markdown_preview:
          type:
            - "string"
            - "null"
          description: "只读解析 Markdown 预览，用于开发者验收和管理后台展示。"
        markdown_preview_object_key:
          type:
            - "string"
            - "null"
          description: "用于加载解析 Markdown 预览的对象 key。"
        markdown_preview_truncated:
          type: "boolean"
          description: "预览是否因为响应大小安全限制被截断。"
        markdown_preview_error:
          type: "string"
          description: "预览加载失败时返回的诊断信息。"
        media_assets:
          type: "array"
          items:
            "$ref": "#/components/schemas/MediaAsset"
        ocr_status:
          "$ref": "#/components/schemas/OcrStatus"
        ocr_blocks:
          type: "array"
          items:
            "$ref": "#/components/schemas/OcrBlock"
        ocr_warnings:
          type: "array"
          items:
            "$ref": "#/components/schemas/OcrWarning"
      additionalProperties: true
    MediaAsset:
      type: "object"
      required:
        - "id"
        - "document_id"
        - "mime_type"
        - "object_key"
        - "caption_status"
        - "caption"
        - "caption_provider_name"
        - "caption_model"
        - "caption_prompt_version"
        - "caption_model_call_id"
        - "caption_cache_hit"
        - "caption_attempt_count"
        - "caption_error"
        - "caption_generated_at"
      properties:
        id:
          "$ref": "#/components/schemas/MediaAssetId"
        document_id:
          "$ref": "#/components/schemas/SourceDocumentId"
        parsed_content_id:
          oneOf:
            - "$ref": "#/components/schemas/ParsedContentId"
            - type: "null"
        mime_type:
          type: "string"
        object_key:
          type: "string"
        width:
          type:
            - "integer"
            - "null"
        height:
          type:
            - "integer"
            - "null"
        locator:
          type: "object"
          description: "Structured source locator. Document-origin visual assets include source_format, asset_kind, extraction_method, and format-specific fields such as page_number, slide_number, sheet_name, source_path, source_url, or image_index when available."
          additionalProperties: true
        caption_status:
          "$ref": "#/components/schemas/CaptionStatus"
        caption:
          type:
            - "string"
            - "null"
          description: "Generated factual caption when available."
        caption_provider_name:
          type:
            - "string"
            - "null"
        caption_model:
          type:
            - "string"
            - "null"
        caption_prompt_version:
          type:
            - "string"
            - "null"
        caption_model_call_id:
          type:
            - "string"
            - "null"
          pattern: "^llm_call_[a-zA-Z0-9]+$"
        caption_cache_hit:
          type: "boolean"
        caption_attempt_count:
          type: "integer"
          minimum: 0
        caption_error:
          oneOf:
            - "$ref": "#/components/schemas/MediaAssetCaptionError"
            - type: "null"
        caption_generated_at:
          oneOf:
            - "$ref": "#/components/schemas/Timestamp"
            - type: "null"
      additionalProperties: true
    CreateUploadSessionRequest:
      type: "object"
      required:
        - "file_name"
        - "mime_type"
        - "size"
      properties:
        file_name:
          type: "string"
        display_name:
          type: "string"
        mime_type:
          type: "string"
        size:
          type: "integer"
          minimum: 1
        content_hash:
          type: "string"
          pattern: "^sha256:[a-f0-9]{64}$"
        source_path:
          type: "string"
        metadata:
          "$ref": "#/components/schemas/CommonMetadata"
      additionalProperties: false
    CreateUploadSessionResponse:
      type: "object"
      required:
        - "upload_session"
        - "presigned_upload"
      properties:
        upload_session:
          "$ref": "#/components/schemas/UploadSession"
        presigned_upload:
          "$ref": "#/components/schemas/PresignedUpload"
      additionalProperties: false
    FinalizeUploadSessionRequest:
      type: "object"
      required:
        - "content_hash"
      properties:
        content_hash:
          type: "string"
          pattern: "^sha256:[a-f0-9]{64}$"
      additionalProperties: false
    PresignedUpload:
      type: "object"
      required:
        - "url"
        - "method"
        - "headers"
        - "expires_at"
      properties:
        url:
          type: "string"
          format: "uri"
          description: "Short-lived object-storage upload URL. Provider credentials are not exposed."
        method:
          type: "string"
          enum:
            - "PUT"
        headers:
          type: "object"
          additionalProperties:
            type: "string"
        expires_at:
          "$ref": "#/components/schemas/Timestamp"
      additionalProperties: false
    OcrRetryRequest:
      type: "object"
      properties:
        mode:
          type: "string"
          enum:
            - "retry_failed"
            - "reprocess"
            - "force_for_pdf"
        page_numbers:
          type: "array"
          items:
            type: "integer"
            minimum: 1
      additionalProperties: false
    AsyncDeleteResponse:
      type: "object"
      required:
        - "id"
        - "status"
        - "cleanup_operation"
      properties:
        id:
          "$ref": "#/components/schemas/ResourceId"
        document_id:
          "$ref": "#/components/schemas/SourceDocumentId"
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        status:
          type: "string"
          enum:
            - "deleted"
        cleanup_operation:
          "$ref": "#/components/schemas/CleanupOperation"
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

上传成功会很快返回 document、job ID 和下一步动作链接。解析、OCR、图片 caption、分析、生成、合并和索引会在 Worker 中继续执行。

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/documents" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -F "file=@./handbook.pdf" \
  -F "archive_path=/guides" \
  -F "metadata_labels=product,handbook"
```

## 响应示例

```json
{
  "data": {
    "document": {
      "id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2",
      "name": "handbook.pdf",
      "source_type": "file",
      "status": "queued",
      "content_hash": "sha256:..."
    },
    "job": {
      "id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q",
      "status": "queued",
      "progress": 0
    },
    "resources": {
      "knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A",
      "source_document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2",
      "job_id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q"
    },
    "links": [
      {
        "rel": "job",
        "method": "GET",
        "href": "/v1/jobs/job_01HX2Y7E8F9G0H1J2K3M4N5P6Q",
        "resource_type": "ingest_job"
      },
      {
        "rel": "retrieve_readiness",
        "method": "GET",
        "href": "/v1/knowledge-bases/kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A/ingest-progress",
        "resource_type": "ingest_progress"
      }
    ]
  },
  "request_id": "req_upload"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/documents\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -F \"file=@./handbook.pdf\" \\ -F \"archive_path=/guides\" \\ -F \"metadata_labels=prod"
  response:
    summary: "响应示例"
    value: '{ "data": { "document": { "id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "name": "handbook.pdf", "status": "queued" }, "job": { "id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q", "status": "queued" }, "resources": { "knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A", "source_document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "job_id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q" }, "links": [{ "rel": "retrieve_readiness", "method": "GET", "href": "/v1/knowledge-bases/kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A/ingest-progress", "resource_type": "ingest_progress" }] }, "request_id": "req_upload" }'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `400 unsupported_file_type`：解析器不支持该 MIME 类型。
- `413 upload_too_large`：文件超过配置的上传大小限制。
- `429 upload_admission_rejected`：上传并发或队列准入达到限制。
- `409 document_delete_preview_required`：删除资料前必须先执行影响预览。
- 批量进度接口用 `job_not_found` 等 item-level error 表达缺失或越权任务，不暴露跨租户任务是否存在。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
