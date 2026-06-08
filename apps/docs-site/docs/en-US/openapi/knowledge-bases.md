# Knowledge Bases API

> A Knowledge Base is the top-level container for sources, Wiki Pages, graph state, retrieval indexes, forks, versions, and dataset configuration.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page when your integration creates datasets, updates dataset configuration, rebuilds indexes, or deletes a Knowledge Base through the same API used by the Admin Console.

## When to Use This Page

- Create one Knowledge Base per product dataset, tenant dataset, or isolated developer workspace.
- Update dataset configuration from the Knowledge Base settings surface, not global settings.
- Delete through the API when you want async cleanup of sources, indexes, objects, and fork-owned overlays.

## Endpoint Matrix

| Method   | Path                                                            | Summary                                     | operationId                     |
| -------- | --------------------------------------------------------------- | ------------------------------------------- | ------------------------------- |
| `GET`    | `/v1/dataset-configuration-presets`                             | List dataset configuration presets          | listDatasetConfigurationPresets |
| `GET`    | `/v1/knowledge-bases`                                           | List knowledge bases                        | listKnowledgeBases              |
| `POST`   | `/v1/knowledge-bases`                                           | Create a knowledge base                     | createKnowledgeBase             |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}`                       | Get a knowledge base                        | getKnowledgeBase                |
| `PATCH`  | `/v1/knowledge-bases/{knowledge_base_id}`                       | Update a knowledge base                     | updateKnowledgeBase             |
| `DELETE` | `/v1/knowledge-bases/{knowledge_base_id}`                       | Delete a knowledge base                     | deleteKnowledgeBase             |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/dataset-configuration` | Get Knowledge Base dataset configuration    | getDatasetConfiguration         |
| `PATCH`  | `/v1/knowledge-bases/{knowledge_base_id}/dataset-configuration` | Update Knowledge Base dataset configuration | updateDatasetConfiguration      |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/reindex`               | Rebuild Knowledge Base indexes              | rebuildKnowledgeBaseIndexes     |

## Field Guide

| Field                             | Meaning                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `name`                            | Human-readable name shown in Admin Console and API responses.                                                                      |
| `slug`                            | Stable developer-friendly identifier. Use lowercase letters, numbers, and hyphens.                                                 |
| `output_language`                 | `auto`, `en-US`, or `zh-CN`; controls generated Wiki language preference.                                                          |
| `dataset_configuration`           | Preset and override values for parser, graph, retrieval, OCR, caption, and context budget behavior.                                |
| `values.prompt_templates`         | Per-purpose prompt template settings for `analysis`, `generation`, `merge`, `vision_caption`, `knowledge_check`, and `wiki_draft`. |
| `prompt_templates.<purpose>.mode` | `built_in`, `custom_instructions`, or `override_template`.                                                                         |
| `knowledge_base_type`             | `canonical` for source datasets, `fork` for user-owned overlays.                                                                   |

## Prompt Template Configuration

Prompt templates are dataset-scoped. They are edited through `PATCH /v1/knowledge-bases/{knowledge_base_id}/dataset-configuration`, inherited by forks at fork creation, and resolved from the latest dataset configuration snapshot when a job starts.

| Mode                  | Behavior                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `built_in`            | Uses the built-in prompt id exactly.                                                                                                           |
| `custom_instructions` | Adds administrator instructions while preserving locked source-traceability and structured-output contracts.                                   |
| `override_template`   | Replaces the editable template body after deterministic validation. Required source, evidence, schema, and output markers must remain present. |

Provider endpoint, API key, model name, streaming, retry, timeout, and concurrency remain env-first. `prompt_templates` accepts prompt configuration only; the API rejects secret-like fields and omits them from dataset configuration.

When a prompt-configurable job runs, model-call and job metadata can include:

| Metadata field                      | Meaning                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `prompt_purpose`                    | One of the six supported prompt purposes.                                                                            |
| `prompt_mode`                       | Effective prompt mode for that job.                                                                                  |
| `built_in_prompt_id`                | Built-in prompt id used as the base contract.                                                                        |
| `effective_prompt_version`          | Built-in version or custom hash-qualified version.                                                                   |
| `effective_prompt_hash`             | SHA-256 hash of the effective prompt text.                                                                           |
| `dataset_configuration_snapshot_id` | Snapshot that the job resolved at start.                                                                             |
| `structured_output_attempt_count`   | Number of schema-validation attempts for model output when applicable.                                               |
| `structured_output_repair_attempts` | Number of repair prompt attempts used when applicable.                                                               |
| `structured_output_final_status`    | Final structured-output status, such as `succeeded`, `failed`, `skipped_with_fallback`, or `source_backed_fallback`. |

Full prompt text is visible only in authenticated Admin/API configuration and preview contexts. Retrieve responses and public developer workflow responses omit the full effective prompt text.

For `analysis`, built-in and custom-instruction modes preserve a locked contract requiring a strict JSON object with top-level `entities`, `concepts`, `claims`, `contradictions`, and `relationships` arrays. If analysis structured-output repair is exhausted but Parsed Content still provides source-traceable text, the worker can continue with `source_backed_fallback` metadata and no model-inferred relationships. For `generation`, they preserve a locked contract requiring a strict JSON object with a top-level non-empty `drafts` array. Override templates must keep those output contracts, source traceability, and unsupported-claim rules.

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
  "/dataset-configuration-presets":
    get:
      summary: "List dataset configuration presets"
      description: "Returns safe, editable Knowledge Base dataset presets. Provider secrets are never included."
      operationId: "listDatasetConfigurationPresets"
      responses:
        200:
          description: "Dataset configuration presets."
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
                          "$ref": "#/components/schemas/DatasetConfigurationPreset"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
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
  "/knowledge-bases/{knowledge_base_id}":
    get:
      summary: "Get a knowledge base"
      operationId: "getKnowledgeBase"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    patch:
      summary: "Update a knowledge base"
      operationId: "updateKnowledgeBase"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    delete:
      summary: "Delete a knowledge base"
      operationId: "deleteKnowledgeBase"
      responses:
        200:
          description: "Knowledge Base deletion accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/AsyncDeleteResponse"
  "/knowledge-bases/{knowledge_base_id}/dataset-configuration":
    get:
      summary: "Get Knowledge Base dataset configuration"
      description: "Returns the active dataset-scoped configuration used by ingest, retrieval, Knowledge Check, and Source Watch policy."
      operationId: "getDatasetConfiguration"
      responses:
        200:
          description: "Knowledge Base dataset configuration."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/DatasetConfiguration"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    patch:
      summary: "Update Knowledge Base dataset configuration"
      description: "Updates dataset-scoped behavior for the selected Knowledge Base. Runtime provider secrets remain env-only."
      operationId: "updateDatasetConfiguration"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/DatasetConfigurationValues"
      responses:
        200:
          description: "Updated Knowledge Base dataset configuration."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/DatasetConfiguration"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/reindex":
    post:
      summary: "Rebuild Knowledge Base indexes"
      operationId: "rebuildKnowledgeBaseIndexes"
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
    DatasetConfiguration:
      type: "object"
      required:
        - "id"
        - "knowledge_base_id"
        - "preset_id"
        - "status"
        - "version"
        - "values"
        - "latest_snapshot_id"
      properties:
        id:
          "$ref": "#/components/schemas/DatasetConfigurationId"
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        latest_snapshot_id:
          "$ref": "#/components/schemas/DatasetConfigurationSnapshotId"
        values:
          "$ref": "#/components/schemas/DatasetConfigurationValues"
      additionalProperties: true
    DatasetConfigurationValues:
      type: "object"
      required:
        - "purpose"
        - "schema"
        - "markdown_contract"
        - "output_language"
        - "retrieval"
        - "source_lifecycle"
        - "knowledge_check"
        - "source_watch"
        - "ocr_policy"
        - "prompt_templates"
      properties:
        prompt_templates:
          type: "object"
          description: "Dataset-scoped prompt template configuration. Provider endpoints, API keys, and model secrets are env-only and are not accepted here."
          additionalProperties: false
          properties:
            analysis:
              "$ref": "#/components/schemas/DatasetPromptTemplateValue"
            generation:
              "$ref": "#/components/schemas/DatasetPromptTemplateValue"
            merge:
              "$ref": "#/components/schemas/DatasetPromptTemplateValue"
            vision_caption:
              "$ref": "#/components/schemas/DatasetPromptTemplateValue"
            knowledge_check:
              "$ref": "#/components/schemas/DatasetPromptTemplateValue"
            wiki_draft:
              "$ref": "#/components/schemas/DatasetPromptTemplateValue"
      additionalProperties: true
    DatasetPromptTemplateValue:
      type: "object"
      required:
        - "mode"
        - "built_in_prompt_id"
        - "custom_instructions"
        - "override_template"
      properties:
        mode:
          type: "string"
          enum:
            - "built_in"
            - "custom_instructions"
            - "override_template"
        built_in_prompt_id:
          type: "string"
          example: "analysis@0.1.0"
        custom_instructions:
          oneOf:
            - type: "string"
              maxLength: 12000
            - type: "null"
        override_template:
          oneOf:
            - type: "string"
              maxLength: 24000
            - type: "null"
      additionalProperties: false
    DatasetConfigurationPreset:
      type: "object"
      required:
        - "id"
        - "name"
        - "description"
        - "version"
        - "default_values"
        - "validation"
      properties:
        default_values:
          "$ref": "#/components/schemas/DatasetConfigurationValues"
      additionalProperties: true
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

Create the Knowledge Base first, then upload documents or configure Source Watch. Store the returned `id` for all later operations.

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Docs",
    "slug": "product-docs",
    "description": "Developer documentation and release notes",
    "output_language": "en-US"
  }'
```

Update prompt templates for a single Knowledge Base:

```bash
curl -X PATCH "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/dataset-configuration" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -H "X-Fococontext-Locale: en-US" \
  -d '{
    "values": {
      "prompt_templates": {
        "analysis": {
          "mode": "custom_instructions",
          "built_in_prompt_id": "analysis@0.1.0",
          "custom_instructions": "Preserve exact SDK class names and version numbers from the source document.",
          "override_template": null
        }
      }
    }
  }'
```

## Response Example

```json
{
  "data": {
    "id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A",
    "name": "Product Docs",
    "slug": "product-docs",
    "status": "ready",
    "knowledge_base_type": "canonical",
    "current_version_id": null
  },
  "request_id": "req_kb_create"
}
```

Dataset configuration update response:

```json
{
  "data": {
    "id": "kbcfg_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A",
    "knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A",
    "version": 3,
    "latest_snapshot_id": "kbcfgs_01HX2Y36C4D5F6G7H8J9K0M1N2",
    "values": {
      "prompt_templates": {
        "analysis": {
          "mode": "custom_instructions",
          "built_in_prompt_id": "analysis@0.1.0",
          "custom_instructions": "Preserve exact SDK class names and version numbers from the source document.",
          "override_template": null
        }
      }
    }
  },
  "request_id": "req_dataset_config_update"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"name\": \"Product Docs\", \"slug\": \"product-docs\", \"description\": \"De"
  response:
    summary: "Response example"
    value: '{ "data": { "id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A", "name": "Product Docs", "slug": "product-docs", "status": "ready", "knowledge_base_type": "canonical", "current_version_id": null }, "request_id": "req_kb_create" }'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `400 invalid_request`: missing name, invalid slug, or unsupported output language.
- `400 invalid_request`: invalid `prompt_templates.<purpose>.override_template`; `error.details.fields` points to the failed field, for example `prompt_templates.analysis.override_template`.
- `400 invalid_request`: provider secret-like fields such as `api_key`, `base_url`, or `model` were sent in `prompt_templates`; configure provider values through `.env` instead.
- `409 duplicate_slug`: another Knowledge Base already uses the same slug.
- `409 resource_cleanup_pending`: the Knowledge Base is hidden but async cleanup has not completed.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
