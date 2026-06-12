# 知识库 API

> Knowledge Base 是资料、Wiki 页面、图谱状态、检索索引、分叉、版本和数据集配置的一级容器。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于创建数据集、更新 dataset configuration、重建索引或通过与管理后台一致的 API 删除 Knowledge Base。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 每个产品数据集、租户数据集或隔离开发工作区创建一个 Knowledge Base。
- 数据集相关配置应从知识库设置里更新，部署级配置保留在全局环境变量中。
- 需要异步清理资料、索引、对象存储和分叉覆盖层时，通过 API 删除。

## 端点矩阵

| 方法     | 路径                                                            | 说明                 | operationId                     |
| -------- | --------------------------------------------------------------- | -------------------- | ------------------------------- |
| `GET`    | `/v1/dataset-configuration-presets`                             | 列出数据集配置预设   | listDatasetConfigurationPresets |
| `GET`    | `/v1/knowledge-bases`                                           | 列出知识库           | listKnowledgeBases              |
| `POST`   | `/v1/knowledge-bases`                                           | 创建知识库           | createKnowledgeBase             |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}`                       | 获取知识库           | getKnowledgeBase                |
| `PATCH`  | `/v1/knowledge-bases/{knowledge_base_id}`                       | 更新知识库           | updateKnowledgeBase             |
| `DELETE` | `/v1/knowledge-bases/{knowledge_base_id}`                       | 删除知识库           | deleteKnowledgeBase             |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/dataset-configuration` | 获取知识库数据集配置 | getDatasetConfiguration         |
| `PATCH`  | `/v1/knowledge-bases/{knowledge_base_id}/dataset-configuration` | 更新知识库数据集配置 | updateDatasetConfiguration      |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/reindex`               | 重建知识库索引       | rebuildKnowledgeBaseIndexes     |

## 字段说明

| 字段                              | 说明                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `name`                            | 展示在管理后台和 API 响应中的人类可读名称。                                                                             |
| `slug`                            | 面向开发者的稳定标识，建议只使用小写字母、数字和连字符。                                                                |
| `output_language`                 | `auto`、`en-US` 或 `zh-CN`，控制生成 Wiki 的语言偏好。                                                                  |
| `dataset_configuration`           | 解析、图谱、检索、OCR、图片 caption 和上下文预算的预设与覆盖值。                                                        |
| `values.prompt_templates`         | 按用途保存提示词模板配置，支持 `analysis`、`generation`、`merge`、`vision_caption`、`knowledge_check` 和 `wiki_draft`。 |
| `prompt_templates.<purpose>.mode` | `built_in`、`custom_instructions` 或 `override_template`。                                                              |
| `knowledge_base_type`             | `canonical` 表示源数据集，`fork` 表示用户私有覆盖层。                                                                   |

## 提示词模板配置

提示词模板是数据集级配置。它通过 `PATCH /v1/knowledge-bases/{knowledge_base_id}/dataset-configuration` 更新；创建 fork 时会继承上游当前值；任务启动时从数据集配置快照解析，运行中的任务会继续使用启动时的 snapshot。

| 模式                  | 行为                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `built_in`            | 完全使用内置提示词 ID。                                                             |
| `custom_instructions` | 追加管理员说明，同时保留锁定的来源追溯和结构化输出契约。                            |
| `override_template`   | 替换可编辑模板主体，但保存前会做确定性校验，必须保留来源、证据、schema 和输出标记。 |

provider endpoint、API key、model name、streaming、retry、timeout 和 concurrency 仍然采用 env-first 配置。`prompt_templates` 只接受提示词配置；API 会拒绝类似密钥的字段，并省略这类数据集保存。

提示词相关任务运行时，model-call 和 job metadata 可以包含：

| metadata 字段                       | 说明                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `prompt_purpose`                    | 六种受支持用途之一。                                                                                  |
| `prompt_mode`                       | 本次任务实际使用的模式。                                                                              |
| `built_in_prompt_id`                | 作为基础契约的内置提示词 ID。                                                                         |
| `effective_prompt_version`          | 内置版本或带 hash 的自定义版本。                                                                      |
| `effective_prompt_hash`             | effective prompt 文本的 SHA-256 哈希。                                                                |
| `dataset_configuration_snapshot_id` | 任务启动时解析的配置快照。                                                                            |
| `structured_output_attempt_count`   | 适用时，模型结构化输出 schema 校验尝试次数。                                                          |
| `structured_output_repair_attempts` | 适用时，repair prompt 尝试次数。                                                                      |
| `structured_output_final_status`    | 结构化输出最终状态，例如 `succeeded`、`failed`、`skipped_with_fallback` 或 `source_backed_fallback`。 |

完整 prompt 文本只在已认证的管理后台/API 配置和预览上下文中展示。Retrieve 响应和公开开发者流程响应会省略完整 effective prompt 文本。

对于 `analysis`，内置模式和 custom-instruction 模式会保留锁定契约，要求返回带有顶层 `entities`、`concepts`、`claims`、`contradictions`、`relationships` 数组的严格 JSON object。如果 analysis 结构化输出 repair 耗尽，但 Parsed Content 仍然提供可追溯文本，Worker 可以用 `source_backed_fallback` metadata 继续处理，并省略模型推断关系。对于 `generation`，它们会保留锁定契约，要求返回带有顶层非空 `drafts` 数组的严格 JSON object。override template 也必须保留这些输出契约、来源追溯和 unsupported-claim 规则。

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

## 请求示例

先创建知识库，再上传文档或配置 Source Watch。后续所有操作都要保存并使用返回的 `id`。

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Docs",
    "slug": "product-docs",
    "description": "Developer documentation and changelog",
    "output_language": "zh-CN"
  }'
```

更新单个 Knowledge Base 的提示词模板：

```bash
curl -X PATCH "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/dataset-configuration" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -H "X-Fococontext-Locale: zh-CN" \
  -d '{
    "values": {
      "prompt_templates": {
        "analysis": {
          "mode": "custom_instructions",
          "built_in_prompt_id": "analysis@0.1.0",
          "custom_instructions": "保留来源文档里的 SDK class name 和 version number。",
          "override_template": null
        }
      }
    }
  }'
```

## 响应示例

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

数据集配置更新响应：

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
          "custom_instructions": "保留来源文档里的 SDK class name 和 version number。",
          "override_template": null
        }
      }
    }
  },
  "request_id": "req_dataset_config_update"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"name\": \"Product Docs\", \"slug\": \"product-docs\", \"description\": \"De"
  response:
    summary: "响应示例"
    value: '{ "data": { "id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A", "name": "Product Docs", "slug": "product-docs", "status": "ready", "knowledge_base_type": "canonical", "current_version_id": null }, "request_id": "req_kb_create" }'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `400 invalid_request`：名称缺失、slug 不合法或输出语言不受支持。
- `400 invalid_request`：`prompt_templates.<purpose>.override_template` 无效；`error.details.fields` 会指向失败字段，例如 `prompt_templates.analysis.override_template`。
- `400 invalid_request`：`prompt_templates` 中包含类似 provider secret 的字段，例如 `api_key`、`base_url` 或 `model`；provider 配置应写入 `.env`。
- `409 duplicate_slug`：已有其他知识库使用同一个 slug。
- `409 resource_cleanup_pending`：知识库已隐藏，但异步清理尚未完成。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
