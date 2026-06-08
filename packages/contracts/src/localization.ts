export const supportedApiLocales = ["en-US", "zh-CN"] as const;
export type SupportedApiLocale = (typeof supportedApiLocales)[number];

export const defaultApiLocale: SupportedApiLocale = "en-US";

export interface ApiLocaleInput {
  acceptLanguage?: string | readonly string[] | undefined;
  defaultLocale?: SupportedApiLocale | undefined;
  explicitLocale?: string | readonly string[] | undefined;
}

export const localizationGlossary = {
  zhCN: {
    approvedLiteralTerms: [
      "AI",
      "API",
      "API Key",
      "Base URL",
      "Bearer",
      "Bearer API Key",
      "BullMQ",
      "CSV",
      "DOCX",
      "Docker",
      "Docker Compose",
      "HTML",
      "ID",
      "JSON",
      "LLM Wiki",
      "Markdown",
      "MIME",
      "OCR",
      "OpenAPI",
      "PDF",
      "PPTX",
      "PostgreSQL",
      "Redis",
      "REST",
      "Retrieve API",
      "S3",
      "SDK",
      "Slug",
      "Source Watch",
      "Source Watch API",
      "URL",
      "Webhook",
      "Webhook API",
      "Wiki",
      "XML",
      "YAML",
      "Knowledge Check",
    ],
    workflowTerms: {
      changeSet: "变更集",
      graphView: "图谱视图",
      knowledgeCheck: "知识检查",
      retrievalLab: "检索调试",
      sourceWatch: "资料监听",
      wikiDraft: "Wiki 草稿",
    },
  },
} as const;

const apiMessageCatalog = {
  "api.error.invalid_api_key": {
    "en-US": "Invalid API key.",
    "zh-CN": "API Key 无效。",
  },
  "api.error.forbidden": {
    "en-US": "Forbidden.",
    "zh-CN": "无权访问。",
  },
  "api.error.knowledge_base_not_found": {
    "en-US": "Knowledge base not found.",
    "zh-CN": "知识库不存在。",
  },
  "api.error.document_not_found": {
    "en-US": "Document not found.",
    "zh-CN": "资料不存在。",
  },
  "api.error.job_not_found": {
    "en-US": "Job not found.",
    "zh-CN": "任务不存在。",
  },
  "api.error.upload_session_not_found": {
    "en-US": "Upload session not found.",
    "zh-CN": "上传会话不存在。",
  },
  "api.error.page_not_found": {
    "en-US": "Page not found.",
    "zh-CN": "页面不存在。",
  },
  "api.error.version_not_found": {
    "en-US": "Version not found.",
    "zh-CN": "版本不存在。",
  },
  "api.error.unsupported_file_type": {
    "en-US": "Unsupported file type.",
    "zh-CN": "不支持该文件类型。",
  },
  "api.error.parser_failed": {
    "en-US": "Parser failed.",
    "zh-CN": "解析失败。",
  },
  "api.error.parser_timeout": {
    "en-US": "Parser timeout.",
    "zh-CN": "解析超时。",
  },
  "api.error.password_protected_pdf": {
    "en-US": "Password protected PDF.",
    "zh-CN": "暂不支持受密码保护的 PDF。",
  },
  "api.error.parser_output_empty": {
    "en-US": "Parser output empty.",
    "zh-CN": "解析结果为空。",
  },
  "api.error.invalid_request": {
    "en-US": "Invalid request.",
    "zh-CN": "请求参数错误。",
  },
  "api.error.invalid_locator": {
    "en-US": "Evidence locator is invalid.",
    "zh-CN": "证据定位信息无效。",
  },
  "api.error.unsupported_evidence_kind": {
    "en-US": "Evidence kind is unsupported.",
    "zh-CN": "不支持该证据类型。",
  },
  "api.error.evidence_limit_exceeded": {
    "en-US": "Source evidence limit exceeded.",
    "zh-CN": "资料证据返回量超过限制。",
  },
  "api.error.parsed_content_not_available": {
    "en-US": "Parsed content is not available.",
    "zh-CN": "解析内容尚不可用。",
  },
  "api.error.stale_source": {
    "en-US": "Source document is stale.",
    "zh-CN": "资料已过期。",
  },
  "api.error.ingest_failed": {
    "en-US": "Ingest failed.",
    "zh-CN": "入库失败。",
  },
  "api.error.change_set_conflict": {
    "en-US": "Change set conflict.",
    "zh-CN": "变更集冲突。",
  },
  "api.error.retrieve_index_not_ready": {
    "en-US": "Retrieve index not ready.",
    "zh-CN": "检索索引尚未就绪。",
  },
  "api.error.fork_target_invalid": {
    "en-US": "Fork target is invalid.",
    "zh-CN": "分叉目标无效。",
  },
  "api.error.fork_submission_requires_fork": {
    "en-US": "Fork submission requires a forked knowledge base.",
    "zh-CN": "分叉提交需要使用分叉知识库。",
  },
  "api.error.document_delete_preview_required": {
    "en-US": "Document delete preview required.",
    "zh-CN": "需要先预览资料删除影响。",
  },
  "api.error.cleanup_operation_not_found": {
    "en-US": "Cleanup operation not found.",
    "zh-CN": "清理操作不存在。",
  },
  "api.error.cleanup_operation_not_retryable": {
    "en-US": "Cleanup operation is not retryable.",
    "zh-CN": "该清理操作不可重试。",
  },
  "api.error.resource_deleted": {
    "en-US": "Resource has been deleted.",
    "zh-CN": "资源已删除。",
  },
  "api.error.resource_cleanup_pending": {
    "en-US": "Resource cleanup is pending.",
    "zh-CN": "资源清理中。",
  },
  "api.error.resource_conflict": {
    "en-US": "Resource conflict.",
    "zh-CN": "资源冲突。",
  },
  "api.error.ingest_lock_conflict": {
    "en-US": "Ingest lock conflict.",
    "zh-CN": "入库锁冲突。",
  },
  "api.error.rate_limited": {
    "en-US": "Rate limited.",
    "zh-CN": "请求过于频繁。",
  },
  "api.error.internal_error": {
    "en-US": "Internal error.",
    "zh-CN": "服务内部错误。",
  },
  "api.validation.admin_session_required": {
    "en-US": "Admin session required.",
    "zh-CN": "需要管理员会话。",
  },
  "api.validation.openapi_document_auth_required": {
    "en-US":
      "OpenAPI document access requires an authenticated admin session or API key with documentation read scope.",
    "zh-CN": "访问 OpenAPI 文档需要已登录管理员会话，或具备文档读取权限的 API Key。",
  },
  "api.validation.api_key_permission_required": {
    "en-US": "API key does not have permission for this route.",
    "zh-CN": "API Key 没有访问此路由所需的权限。",
  },
  "api.validation.invalid_admin_credentials": {
    "en-US": "Invalid admin credentials.",
    "zh-CN": "管理员账号或密码无效。",
  },
  "api.validation.knowledge_base_slug_invalid": {
    "en-US": "Knowledge base slug is invalid.",
    "zh-CN": "知识库 slug 无效。",
  },
  "api.validation.knowledge_base_slug_conflict": {
    "en-US": "Knowledge base slug already exists in this project.",
    "zh-CN": "当前项目中已存在相同的知识库 slug。",
  },
  "api.validation.knowledge_base_name_required": {
    "en-US": "Knowledge base name is required.",
    "zh-CN": "知识库名称为必填项。",
  },
  "api.validation.knowledge_base_template_invalid": {
    "en-US": "Knowledge base template is invalid.",
    "zh-CN": "知识库模板无效。",
  },
  "api.validation.dataset_configuration_preset_invalid": {
    "en-US": "Dataset configuration preset is invalid.",
    "zh-CN": "数据集配置预设无效。",
  },
  "api.validation.knowledge_base_settings_invalid": {
    "en-US": "Knowledge base settings validation failed.",
    "zh-CN": "知识库设置校验失败。",
  },
  "api.validation.prompt_template_invalid": {
    "en-US": "Prompt template validation failed.",
    "zh-CN": "提示词模板校验失败。",
  },
  "api.validation.fork_owner_invalid": {
    "en-US": "Fork owner metadata is invalid.",
    "zh-CN": "分叉归属信息无效。",
  },
  "api.validation.fork_submission_content_required": {
    "en-US": "Fork submission content is required.",
    "zh-CN": "分叉提交内容为必填项。",
  },
  "api.validation.fork_submission_title_required": {
    "en-US": "Fork submission title is required.",
    "zh-CN": "分叉提交标题为必填项。",
  },
  "api.validation.invalid_knowledge_base_setting": {
    "en-US": "Invalid knowledge base setting.",
    "zh-CN": "知识库设置项无效。",
  },
  "api.validation.document_status_filter_invalid": {
    "en-US": "Document status filter is invalid.",
    "zh-CN": "资料状态筛选条件无效。",
  },
  "api.validation.document_source_type_filter_invalid": {
    "en-US": "Document source type filter is invalid.",
    "zh-CN": "资料来源类型筛选条件无效。",
  },
  "api.validation.only_one_file": {
    "en-US": "Only one file can be uploaded per request.",
    "zh-CN": "每次请求只能上传一个文件。",
  },
  "api.validation.multipart_file_required": {
    "en-US": "Multipart upload requires a file field.",
    "zh-CN": "multipart 上传需要包含 file 字段。",
  },
  "api.validation.file_content_required": {
    "en-US": "File source content is required.",
    "zh-CN": "文件资料内容不能为空。",
  },
  "api.validation.upload_too_large": {
    "en-US": "Uploaded file exceeds the configured size limit.",
    "zh-CN": "上传文件超过配置的大小限制。",
  },
  "api.validation.direct_upload_disabled": {
    "en-US": "Direct upload is not enabled for this deployment.",
    "zh-CN": "当前部署未启用直传上传。",
  },
  "api.validation.multipart_upload_disabled": {
    "en-US": "Multipart upload fallback is disabled for this deployment.",
    "zh-CN": "当前部署已禁用 multipart 上传兜底。",
  },
  "api.validation.upload_admission_limit": {
    "en-US": "Upload concurrency limit reached. Retry later or use direct upload.",
    "zh-CN": "上传并发已达上限，请稍后重试或使用直传上传。",
  },
  "api.validation.upload_session_expired": {
    "en-US": "Upload session expired. Create a new upload session.",
    "zh-CN": "上传会话已过期，请重新创建上传会话。",
  },
  "api.validation.upload_session_object_missing": {
    "en-US": "Uploaded object was not found. Upload the file before finalizing.",
    "zh-CN": "未找到已上传对象，请先完成文件上传再提交。",
  },
  "api.validation.upload_session_size_mismatch": {
    "en-US": "Uploaded object size does not match the upload session.",
    "zh-CN": "已上传对象大小与上传会话不一致。",
  },
  "api.validation.upload_session_checksum_mismatch": {
    "en-US": "Uploaded object checksum does not match the upload session.",
    "zh-CN": "已上传对象校验值与上传会话不一致。",
  },
  "api.validation.upload_timeout": {
    "en-US": "Upload timed out before the server received the full file.",
    "zh-CN": "上传超时，服务端未能在限制时间内接收完整文件。",
  },
  "api.validation.upload_aborted": {
    "en-US": "Upload was aborted before the server received the full file.",
    "zh-CN": "上传已中断，服务端未能接收完整文件。",
  },
  "api.validation.content_hash_invalid": {
    "en-US": "Content hash must be a sha256 hash.",
    "zh-CN": "内容哈希必须是 sha256 哈希。",
  },
  "api.validation.media_asset_not_found": {
    "en-US": "Media asset was not found.",
    "zh-CN": "媒体资产不存在。",
  },
  "api.validation.failed_caption_only": {
    "en-US": "Only failed media captions can be retried.",
    "zh-CN": "只能重试失败的图片说明任务。",
  },
  "api.validation.caption_retry_requires_context": {
    "en-US": "Media caption retry requires parsed content and an ingest job.",
    "zh-CN": "重试图片说明需要已有解析内容和入库任务。",
  },
  "api.validation.ocr_pdf_required": {
    "en-US": "OCR retry requires a PDF source document.",
    "zh-CN": "OCR 重试需要 PDF 资料。",
  },
  "api.validation.ocr_queue_disabled": {
    "en-US": "OCR retry is not available because the source.ocr queue is disabled.",
    "zh-CN": "source.ocr 队列未启用，无法重试 OCR。",
  },
  "api.validation.ocr_retry_requires_context": {
    "en-US": "OCR retry requires parsed content and an ingest job.",
    "zh-CN": "OCR 重试需要已有解析内容和入库任务。",
  },
  "api.validation.ocr_retry_mode_invalid": {
    "en-US": "OCR retry mode is invalid.",
    "zh-CN": "OCR 重试模式无效。",
  },
  "api.validation.ocr_retry_pages_required": {
    "en-US": "OCR retry requires at least one PDF page locator.",
    "zh-CN": "OCR 重试需要至少一个 PDF 页定位信息。",
  },
  "api.validation.source_field_required": {
    "en-US": "Required source field is missing.",
    "zh-CN": "缺少必填资料字段。",
  },
  "api.validation.source_url_invalid": {
    "en-US": "Source URL is invalid.",
    "zh-CN": "资料 URL 无效。",
  },
  "api.validation.source_upload_failed": {
    "en-US": "Source object upload failed.",
    "zh-CN": "资料对象上传失败。",
  },
  "api.validation.source_evidence_locator_invalid": {
    "en-US": "Evidence locator is invalid.",
    "zh-CN": "证据定位信息无效。",
  },
  "api.validation.source_evidence_kind_unsupported": {
    "en-US": "Evidence kind is unsupported.",
    "zh-CN": "不支持该证据类型。",
  },
  "api.validation.source_evidence_limit_exceeded": {
    "en-US": "Source evidence response exceeds configured limits.",
    "zh-CN": "资料证据响应超过配置限制。",
  },
  "api.validation.source_evidence_parsed_content_required": {
    "en-US": "Source evidence requires parsed content.",
    "zh-CN": "资料证据需要已有解析内容。",
  },
  "api.validation.source_evidence_stale_source": {
    "en-US": "Source evidence cannot be resolved for a stale source document.",
    "zh-CN": "已过期资料无法解析资料证据。",
  },
  "api.validation.completed_job_cancel": {
    "en-US": "Completed jobs cannot be canceled.",
    "zh-CN": "已完成任务不能取消。",
  },
  "api.validation.running_job_retry": {
    "en-US": "Running jobs cannot be retried.",
    "zh-CN": "运行中的任务不能重试。",
  },
  "api.validation.cleanup_status_invalid": {
    "en-US": "Cleanup operation status filter is invalid.",
    "zh-CN": "清理操作状态筛选条件无效。",
  },
  "api.validation.cleanup_enqueue_failed": {
    "en-US": "Cleanup queue enqueue failed.",
    "zh-CN": "清理队列入队失败。",
  },
  "api.validation.required_system_page_missing": {
    "en-US": "Required system page is missing.",
    "zh-CN": "缺少必需的系统页。",
  },
  "api.validation.change_set_not_found": {
    "en-US": "Change Set not found.",
    "zh-CN": "变更集不存在。",
  },
  "api.validation.knowledge_base_deleted": {
    "en-US": "Knowledge Base has been deleted.",
    "zh-CN": "知识库已删除。",
  },
  "api.validation.api_key_v02_boundary": {
    "en-US": "API key management is a V0.2 boundary in V0.1.",
    "zh-CN": "API Key 管理属于 V0.2 能力边界，V0.1 暂不支持。",
  },
  "api.validation.source_watch_rule_not_found": {
    "en-US": "Source watch rule not found.",
    "zh-CN": "资料监听规则不存在。",
  },
  "api.validation.scheduled_import_job_not_found": {
    "en-US": "Scheduled import job not found.",
    "zh-CN": "计划导入任务不存在。",
  },
  "api.validation.source_watch_field_required": {
    "en-US": "Source watch rule field is required.",
    "zh-CN": "资料监听规则字段为必填项。",
  },
  "api.validation.source_watch_kind_invalid": {
    "en-US": "Source watch source kind is invalid.",
    "zh-CN": "资料监听来源类型无效。",
  },
  "api.validation.source_watch_kind_unsupported": {
    "en-US": "Source watch source kind is not supported in this runtime.",
    "zh-CN": "当前运行环境不支持该资料监听来源类型。",
  },
  "api.validation.source_watch_kind_disabled": {
    "en-US": "Source watch source kind is not enabled for this Knowledge Base.",
    "zh-CN": "该知识库未启用此资料监听来源类型。",
  },
  "api.validation.source_watch_mounted_directory_location_invalid": {
    "en-US":
      "Mounted directory location must be under the configured Source Watch container directory.",
    "zh-CN": "挂载目录位置必须位于配置的资料监听容器目录下。",
  },
  "api.validation.source_watch_url_list_invalid": {
    "en-US": "URL list location must contain valid HTTP or HTTPS URLs.",
    "zh-CN": "URL 列表位置必须包含有效的 HTTP 或 HTTPS URL。",
  },
  "api.validation.source_watch_s3_location_invalid": {
    "en-US": "S3 location must use an s3://bucket/prefix value.",
    "zh-CN": "S3 位置必须使用 s3://bucket/prefix 格式。",
  },
  "api.validation.source_watch_git_location_invalid": {
    "en-US": "Git repository location must use an enabled transport.",
    "zh-CN": "Git 仓库位置必须使用已启用的传输协议。",
  },
  "api.validation.source_watch_object_invalid": {
    "en-US": "Source watch rule object field is invalid.",
    "zh-CN": "资料监听规则对象字段无效。",
  },
  "api.validation.source_watch_list_invalid": {
    "en-US": "Source watch rule list field is invalid.",
    "zh-CN": "资料监听规则列表字段无效。",
  },
  "api.validation.source_watch_number_invalid": {
    "en-US": "Source watch rule numeric field is invalid.",
    "zh-CN": "资料监听规则数字字段无效。",
  },
  "api.validation.webhook_url_required": {
    "en-US": "Webhook URL is required.",
    "zh-CN": "Webhook URL 为必填项。",
  },
  "api.validation.webhook_url_invalid": {
    "en-US": "Webhook URL is invalid.",
    "zh-CN": "Webhook URL 无效。",
  },
  "api.validation.webhook_events_required": {
    "en-US": "Webhook events are required.",
    "zh-CN": "Webhook 事件为必填项。",
  },
  "api.validation.webhook_event_invalid": {
    "en-US": "Webhook event is invalid.",
    "zh-CN": "Webhook 事件无效。",
  },
  "api.validation.webhook_status_invalid": {
    "en-US": "Webhook status is invalid.",
    "zh-CN": "Webhook 状态无效。",
  },
  "api.validation.webhook_scope_required": {
    "en-US": "Webhook events require an explicit tenant and project scope.",
    "zh-CN": "Webhook 事件必须具备明确的租户与项目作用域。",
  },
  "api.validation.batch_import_json_source_type_not_executable": {
    "en-US": "Batch import source type is not executable from JSON items.",
    "zh-CN": "批量导入的来源类型无法通过 JSON 条目执行。",
  },
  "api.validation.batch_import_source_type_invalid": {
    "en-US": "Batch import source type is invalid.",
    "zh-CN": "批量导入来源类型无效。",
  },
  "api.validation.batch_import_items_required": {
    "en-US": "Batch import items are required.",
    "zh-CN": "批量导入条目为必填项。",
  },
  "api.validation.batch_import_url_required": {
    "en-US": "URL import item requires a url.",
    "zh-CN": "URL 导入条目需要 url。",
  },
  "api.validation.batch_import_url_invalid": {
    "en-US": "URL import item url is invalid.",
    "zh-CN": "URL 导入条目的 url 无效。",
  },
  "api.validation.batch_import_text_required": {
    "en-US": "Text import item requires text.",
    "zh-CN": "文本导入条目需要 text。",
  },
  "api.validation.wiki_draft_required_field": {
    "en-US": "Wiki Draft {field} is required.",
    "zh-CN": "Wiki 草稿 {field} 为必填项。",
  },
  "api.validation.wiki_draft_apply_mode_invalid": {
    "en-US": "Wiki Draft apply mode is invalid.",
    "zh-CN": "Wiki 草稿应用模式无效。",
  },
  "api.validation.required_field": {
    "en-US": "{field} is required.",
    "zh-CN": "{field} 为必填项。",
  },
  "api.validation.pagination_invalid": {
    "en-US": "Pagination parameters are invalid.",
    "zh-CN": "分页参数无效。",
  },
  "api.validation.knowledge_check_not_found": {
    "en-US": "Knowledge Check not found.",
    "zh-CN": "知识检查不存在。",
  },
  "api.validation.knowledge_check_type_invalid": {
    "en-US": "Knowledge Check type is invalid.",
    "zh-CN": "知识检查类型无效。",
  },
  "api.knowledge_check.finding.missing_source_evidence": {
    "en-US": "Page is missing source evidence.",
    "zh-CN": "页面缺少来源证据。",
  },
  "api.knowledge_check.finding.broken_wikilink": {
    "en-US": "Wikilink target does not exist.",
    "zh-CN": "Wiki 链接目标不存在。",
  },
  "api.knowledge_check.finding.missing_page": {
    "en-US": "Missing page candidate.",
    "zh-CN": "存在缺失页面候选项。",
  },
  "api.knowledge_check.finding.duplicate_title": {
    "en-US": "Duplicate title candidate.",
    "zh-CN": "存在重复标题候选项。",
  },
  "api.knowledge_check.finding.contradiction_candidate": {
    "en-US": "Contradiction candidate.",
    "zh-CN": "存在矛盾候选项。",
  },
  "api.knowledge_check.finding.orphan_page": {
    "en-US": "Page has no incoming or outgoing graph relationships.",
    "zh-CN": "页面没有入向或出向图谱关系。",
  },
  "api.knowledge_check.finding.sparse_community": {
    "en-US": "Page is in a sparse graph community.",
    "zh-CN": "页面位于稀疏图谱社区中。",
  },
  "api.knowledge_check.finding.bridge_page": {
    "en-US": "Page bridges multiple relationship types.",
    "zh-CN": "页面连接了多种关系类型。",
  },
  "api.knowledge_check.finding.weak_evidence": {
    "en-US": "Page evidence is too coarse-grained.",
    "zh-CN": "页面证据粒度过粗。",
  },
  "api.knowledge_check.finding.missing_context": {
    "en-US": "Page needs more surrounding context.",
    "zh-CN": "页面需要补充上下文。",
  },
  "api.knowledge_check.finding.fork_sync_attention_required": {
    "en-US": "Fork needs upstream synchronization attention.",
    "zh-CN": "分叉知识库需要处理上游同步状态。",
  },
  "api.knowledge_check.finding.fork_owned_evidence_uncertainty": {
    "en-US": "Fork-owned content needs stronger evidence.",
    "zh-CN": "分叉内的内容需要补充更强证据。",
  },
  "api.knowledge_check.finding.semantic_consistency": {
    "en-US": "Semantic consistency finding.",
    "zh-CN": "存在语义一致性发现项。",
  },
  "api.job.queued_parsing": {
    "en-US": "Queued for parsing.",
    "zh-CN": "已排队等待解析。",
  },
  "api.job.queued_retry": {
    "en-US": "Queued for retry.",
    "zh-CN": "已排队等待重试。",
  },
  "api.job.queued_reingest_parsing": {
    "en-US": "Queued for re-ingest parsing.",
    "zh-CN": "已排队等待重新入库解析。",
  },
  "api.job.queued_ocr_retry": {
    "en-US": "Queued for OCR retry.",
    "zh-CN": "已排队等待 OCR 重试。",
  },
  "api.job.queued_wiki_draft_parsing": {
    "en-US": "Queued for Wiki Draft parsing.",
    "zh-CN": "已排队等待 Wiki 草稿解析。",
  },
  "api.job.analyzing_content": {
    "en-US": "Analyzing content...",
    "zh-CN": "正在分析内容...",
  },
  "api.job.parsing_failed": {
    "en-US": "Parsing failed.",
    "zh-CN": "解析失败。",
  },
  "api.job.source_parse_failed": {
    "en-US": "Source parse job failed.",
    "zh-CN": "资料解析任务失败。",
  },
  "api.job.canceled_before_parsing": {
    "en-US": "Canceled before parsing completed.",
    "zh-CN": "已在解析完成前取消。",
  },
  "api.job.completed": {
    "en-US": "Job completed.",
    "zh-CN": "任务已完成。",
  },
  "api.job.failed": {
    "en-US": "Job failed.",
    "zh-CN": "任务失败。",
  },
  "api.job.canceled": {
    "en-US": "Job canceled.",
    "zh-CN": "任务已取消。",
  },
  "api.job.indexes_rebuilt": {
    "en-US": "Indexes rebuilt.",
    "zh-CN": "索引已重建。",
  },
  "api.job.canceled_kb_deleted": {
    "en-US": "Canceled because the knowledge base was deleted.",
    "zh-CN": "知识库已删除，任务已取消。",
  },
  "api.job.canceled_document_deleted": {
    "en-US": "Canceled because the source document was deleted.",
    "zh-CN": "资料已删除，任务已取消。",
  },
  "api.job.captioning_media": {
    "en-US": "Captioning media assets...",
    "zh-CN": "正在生成媒体资产说明...",
  },
  "api.job.rendering_pdf_ocr": {
    "en-US": "Rendering PDF pages for OCR...",
    "zh-CN": "正在为 OCR 渲染 PDF 页面...",
  },
  "api.job.running_ocr_scanned_pdf": {
    "en-US": "Running OCR on scanned PDF pages...",
    "zh-CN": "正在对扫描 PDF 页面执行 OCR...",
  },
  "api.job.ocr_skipped": {
    "en-US": "OCR skipped.",
    "zh-CN": "已跳过 OCR。",
  },
  "api.job.ocr_failed": {
    "en-US": "OCR failed.",
    "zh-CN": "OCR 失败。",
  },
  "api.job.generating_wiki_drafts": {
    "en-US": "Generating wiki drafts...",
    "zh-CN": "正在生成 Wiki 草稿...",
  },
  "api.job.analysis_failed": {
    "en-US": "Analysis failed.",
    "zh-CN": "分析失败。",
  },
  "api.job.merging_wiki_drafts": {
    "en-US": "Merging generated wiki drafts...",
    "zh-CN": "正在合并生成的 Wiki 草稿...",
  },
  "api.job.generation_failed": {
    "en-US": "Generation failed.",
    "zh-CN": "生成失败。",
  },
  "api.job.applying_wiki_draft": {
    "en-US": "Applying generated wiki draft...",
    "zh-CN": "正在应用生成的 Wiki 草稿...",
  },
  "api.job.indexing_applied_wiki_draft": {
    "en-US": "Indexing applied wiki draft...",
    "zh-CN": "正在索引已应用的 Wiki 草稿...",
  },
  "api.job.compile_completed": {
    "en-US": "Compile pipeline completed.",
    "zh-CN": "编译流程已完成。",
  },
  "api.job.merge_failed": {
    "en-US": "Merge failed.",
    "zh-CN": "合并失败。",
  },
} as const;

export type ApiMessageKey = keyof typeof apiMessageCatalog;
export type ApiMessageParams = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

const apiMessageTextKeyLookup = Object.fromEntries(
  Object.entries(apiMessageCatalog).map(([key, messages]) => [
    messages["en-US"],
    key as ApiMessageKey,
  ]),
) as Record<string, ApiMessageKey>;

export function isSupportedApiLocale(value: string | undefined): value is SupportedApiLocale {
  return supportedApiLocales.some((locale) => locale === value);
}

export function resolveApiLocale(input: ApiLocaleInput = {}): SupportedApiLocale {
  const fallback = input.defaultLocale ?? defaultApiLocale;
  const explicitLocale = firstHeaderValue(input.explicitLocale);
  const explicitMatch = matchLocaleToken(explicitLocale);

  if (explicitMatch !== undefined) {
    return explicitMatch;
  }

  for (const token of parseAcceptLanguage(firstHeaderValue(input.acceptLanguage))) {
    const match = matchLocaleToken(token);

    if (match !== undefined) {
      return match;
    }
  }

  return fallback;
}

export function translateApiMessage(
  key: ApiMessageKey,
  locale: SupportedApiLocale,
  params: ApiMessageParams = {},
): string {
  const template = apiMessageCatalog[key][locale] ?? apiMessageCatalog[key][defaultApiLocale];

  return interpolateApiMessage(template, params);
}

export function translateApiMessageText(message: string, locale: SupportedApiLocale): string {
  const key = resolveApiMessageKey(message);

  return key === undefined ? message : translateApiMessage(key, locale);
}

export function resolveApiMessageKey(message: string): ApiMessageKey | undefined {
  return apiMessageTextKeyLookup[message];
}

export function hasApiMessageKey(value: string): value is ApiMessageKey {
  return Object.prototype.hasOwnProperty.call(apiMessageCatalog, value);
}

function firstHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function parseAcceptLanguage(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(",")
    .map((part) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      const q = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));

      return {
        tag: tag.trim(),
        weight: q === undefined ? 1 : Number(q.slice(2)),
      };
    })
    .filter((item) => item.tag.length > 0 && Number.isFinite(item.weight) && item.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .map((item) => item.tag);
}

function matchLocaleToken(value: string | undefined): SupportedApiLocale | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "zh" || normalized.startsWith("zh-")) {
    return "zh-CN";
  }

  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en-US";
  }

  return undefined;
}

function interpolateApiMessage(message: string, params: ApiMessageParams): string {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key: string) => {
    const value = params[key];

    return value === undefined || value === null ? match : String(value);
  });
}
