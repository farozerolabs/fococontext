# Sources and Uploads API

> Source Documents are evidence inputs. Uploads create a Source Document and an asynchronous Ingest Job; retrieval results are centered on generated Wiki Pages.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page when your backend uploads files, creates direct upload sessions, inspects parsed content, resolves source evidence, or retries OCR and caption work.

## When to Use This Page

- Use multipart upload for normal files and upload sessions for large direct-to-storage uploads.
- Use text and URL source endpoints when your backend already owns normalized content or URLs.
- Use parsed content, media assets, OCR retry, and caption retry endpoints for source diagnostics and remediation.
- Use Source Evidence endpoints when Retrieve citations need bounded original source text, OCR text, or image captions.
- Use batch job status or Knowledge Base ingest progress after upload for multi-file workflows.

## Endpoint Matrix

| Method   | Path                                                                                             | Summary                                              | operationId                    |
| -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/documents`                                              | List source documents                                | listSourceDocuments            |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents`                                              | Upload a source document                             | uploadSourceDocument           |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/text`                                         | Create a text source document                        | createTextSourceDocument       |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/url`                                          | Create a URL source document                         | createUrlSourceDocument        |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/upload-sessions`                              | Create a direct upload session                       | createSourceUploadSession      |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/documents/upload-sessions/{upload_session_id}/finalize` | Finalize a direct upload session                     | finalizeSourceUploadSession    |
| `POST`   | `/v1/jobs/batch`                                                                                 | Resolve multiple ingest job statuses                 | getIngestJobStatuses           |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/ingest-progress`                                        | Get aggregate ingest progress and Retrieve readiness | getKnowledgeBaseIngestProgress |
| `GET`    | `/v1/documents/{document_id}`                                                                    | Get a source document                                | getSourceDocument              |
| `DELETE` | `/v1/documents/{document_id}`                                                                    | Delete a source document through source lifecycle    | deleteSourceDocument           |
| `GET`    | `/v1/documents/{document_id}/parsed-content`                                                     | Get source document parsed content                   | getSourceDocumentParsedContent |
| `GET`    | `/v1/documents/{document_id}/evidence`                                                           | Resolve source evidence for a document               | getSourceDocumentEvidence      |
| `GET`    | `/v1/documents/{document_id}/media-assets`                                                       | List source document media assets                    | listSourceDocumentMediaAssets  |
| `POST`   | `/v1/source-evidence/resolve`                                                                    | Resolve source evidence in batch                     | resolveSourceEvidence          |
| `GET`    | `/v1/media-assets/{media_asset_id}/preview`                                                      | Get media asset preview metadata                     | getMediaAssetPreview           |
| `POST`   | `/v1/media-assets/{media_asset_id}/caption/retry`                                                | Retry media asset caption                            | retryMediaAssetCaption         |
| `POST`   | `/v1/documents/{document_id}/ocr/retry`                                                          | Retry or reprocess source document OCR               | retrySourceDocumentOcr         |
| `POST`   | `/v1/documents/{document_id}/delete-preview`                                                     | Preview source deletion impact                       | previewSourceDeletionImpact    |
| `POST`   | `/v1/documents/{document_id}/reingest`                                                           | Re-ingest a source document                          | reingestSourceDocument         |

## Field Guide

| Field             | Meaning                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `archive_path`    | Virtual directory for organizing sources in Admin Console. It can be independent from local filesystem paths.     |
| `metadata_labels` | Metadata labels that help filtering and source attribution.                                                       |
| `object_key`      | Storage key generated by the server. It includes uniqueness protection; use original filename fields for display. |
| `content_hash`    | Hash of the uploaded content for traceability and duplicate detection.                                            |
| `job_id`          | Poll this job until ingest completes, fails, or is canceled.                                                      |
| `resources`       | Upload response object with `knowledge_base_id`, `source_document_id`, and `job_id`.                              |
| `links`           | Machine-readable next actions such as job detail, source document detail, ingest progress, and documentation.     |
| `locator_status`  | Source Evidence status. Quote the returned text only when this value is `resolved`.                               |

## Source Evidence Dereference

`GET /v1/documents/{document_id}/parsed-content` is a diagnostic preview and can be truncated. Use Source Evidence for Agent citation dereference.

Use `GET /v1/documents/{document_id}/evidence` for one citation, `POST /v1/source-evidence/resolve` for ordered batches, or set `include_resolved_evidence: true` on Retrieve and Retrieve Expand when an Agent needs bounded evidence inline. Requests accept `knowledge_base_id`, `locator`, `media_asset_id`, `evidence_kind`, `max_chars`, `context_chars`, and explicit `allow_fallback`.

Text locators can be parser locators such as `line:12` or `line:12-14`, model locators such as `source_markdown`, `source_markdown:12`, or `source_markdown:12-14`, or source-ref anchors emitted by Retrieve. OCR locators can use `ocr:page:1:block:0`, `page:1:0`, `page:1;block:0`, `page=1:block=0`, `page=1; block_index=0`, or a block range such as `page:1;block:0-6`. When the model returns a comma-separated text anchor such as `SECTION-101,SECTION-102`, Source Evidence resolves the span covering the matched anchors.

For Agent or MCP integrations, pass the same canonical Knowledge Base ID or fork ID used by Retrieve as `knowledge_base_id`. This keeps evidence dereference scoped to canonical sources, upstream inherited fork sources, and the current fork-owned overlay while rejecting other forks.

Default limits are `max_chars=4000`, `context_chars=800`, batch size `20`, and batch total output `40000` characters. Maximum single-item limits are `max_chars=12000` and `context_chars=2000`.

## Cross-Format Media Assets

Document-origin visuals use one Media Asset contract across PDF, DOCX, PPTX, spreadsheets, Markdown, and HTML. A Media Asset locator includes `source_format`, `asset_kind`, `extraction_method`, and format-specific metadata such as `page_number`, `slide_number`, `sheet_name`, `source_path`, `source_url`, or `image_index` when available.

PDF visual extraction can produce embedded images and bounded low-text page snapshots. OCR remains separate: OCR blocks are text evidence, while `image_caption` evidence is a generated factual description of a Media Asset. Remote Markdown and HTML images are skipped by default unless the deployment explicitly enables safe remote fetching.

Agents should use `/v1/documents/{document_id}/media-assets` to list assets, `/v1/source-evidence/resolve` to dereference `image_caption` citations, and `/v1/media-assets/{media_asset_id}/preview` only when they need a controlled original-image preview.

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
          description: "Read-only parsed Markdown preview for developer validation and Admin Console display."
        markdown_preview_object_key:
          type:
            - "string"
            - "null"
          description: "Object key used to load the parsed Markdown preview."
        markdown_preview_truncated:
          type: "boolean"
          description: "Whether the preview was truncated for response size safety."
        markdown_preview_error:
          type: "string"
          description: "Diagnostic message when the preview could not be loaded."
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

## Request Example

A successful upload returns quickly with document and job IDs plus next-action links. Parsing, OCR, caption, analysis, generation, merge, and indexing continue in workers.

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/documents" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -F "file=@./handbook.pdf" \
  -F "archive_path=/guides" \
  -F "metadata_labels=product,handbook"
```

## Response Example

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

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/documents\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -F \"file=@./handbook.pdf\" \\ -F \"archive_path=/guides\" \\ -F \"metadata_labels=prod"
  response:
    summary: "Response example"
    value: '{ "data": { "document": { "id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "name": "handbook.pdf", "status": "queued" }, "job": { "id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q", "status": "queued" }, "resources": { "knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A", "source_document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "job_id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q" }, "links": [{ "rel": "retrieve_readiness", "method": "GET", "href": "/v1/knowledge-bases/kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A/ingest-progress", "resource_type": "ingest_progress" }] }, "request_id": "req_upload" }'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `400 unsupported_file_type`: parser does not support the uploaded MIME type.
- `413 upload_too_large`: file exceeds configured upload limit.
- `429 upload_admission_rejected`: upload concurrency or queue admission limit was reached.
- `409 document_delete_preview_required`: source deletion needs impact preview before cleanup.
- Batch progress returns item-level errors such as `job_not_found` without revealing cross-tenant job existence.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
