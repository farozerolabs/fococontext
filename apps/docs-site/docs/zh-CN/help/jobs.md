# 任务与时间线

## 引言

任务页用于观察异步处理。上传、Source Watch、删除清理、caption 重试和面向用户的索引动作都可能产生任务或任务事件。内部 Graph Insights refresh 记录不进入任务列表；Graph Insights 状态在图谱页面查看。

## 步骤 1：查看任务列表

任务以带表头的表格列表展示，并按更新时间倒序排列，最新任务在最上方。

| 列             | 含义                                                 |
| -------------- | ---------------------------------------------------- |
| 任务           | 任务名称和 Ingest Job ID，排查时可复制               |
| Knowledge Base | 所属知识库                                           |
| Source         | 关联资料                                             |
| 状态           | queued、running、completed、failed、canceled         |
| 当前阶段       | 解析、分析、生成、合并、索引、任务完成等单一状态文案 |
| 进度           | 当前任务进度，只有任务完成才显示 100%                |
| 更新时间       | 最新事件时间                                         |
| 操作           | 根据任务状态显示详情、重试和取消等操作               |

## 步骤 2：打开任务详情

点击任务行里的详情操作查看更深的诊断信息。详情只针对当前行展开，任务页默认保持为进度列表。

| 区块   | 用途                                                                 |
| ------ | -------------------------------------------------------------------- |
| 摘要   | Job ID、Knowledge Base ID、Source ID、Change Set、状态和创建时间     |
| 时间线 | 最新事件在上，历史事件向下排列                                       |
| 元数据 | parser cache、model call、analysis result、version、index 等排查数据 |
| 操作   | 复制 ID、重试失败任务、跳转关联资源                                  |

## 步骤 3：理解阶段

| 阶段       | 成功后产生什么                                                    |
| ---------- | ----------------------------------------------------------------- |
| parsing    | parsed content、media assets、parser warnings                     |
| analyzing  | entities、concepts、relationships、source summary                 |
| generating | Wiki draft pages、system page updates                             |
| merging    | Page versions、Change Set、merge records                          |
| indexing   | full-text index、embedding index、graph index、retrieve readiness |
| completed  | 任务完成，可进入检索                                              |

时间线里的历史事件会在任务完成后显示“解析已完成”“分析已完成”等完成态。它们仍是历史记录，用于追踪实际发生过的步骤。

## 步骤 4：处理失败

失败时不要只看列表状态，打开详情检查失败阶段。

| 失败阶段   | 常见原因                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| parsing    | 文件损坏、格式不支持、OCR 不可用、解析器超时                                                            |
| analyzing  | Chat provider 配置错误、模型限流、缺少 analysis 集合契约、`output_validation_failed` 结构化输出修复失败 |
| generating | 模型输出不符合契约、缺少 `drafts` 契约、上下文过长                                                      |
| merging    | 页面冲突、版本写入失败、数据库约束错误                                                                  |
| indexing   | Embedding provider 失败、pgvector 或全文索引错误                                                        |
| cleanup    | S3 删除失败、关联数据仍被引用                                                                           |

修复配置或数据后，使用重试。重试应保留同一个 source，并生成新的任务事件。

## 步骤 5：理解进度

进度用于帮助用户理解任务推进。生产集成应以 job status 和 stage event 为准。

| 进度   | 典型阶段         |
| ------ | ---------------- |
| 0-10%  | queued / parsing |
| 20-40% | analyzing        |
| 45-65% | generating       |
| 70-85% | merging          |
| 90-99% | indexing         |
| 100%   | completed        |

如果任务失败，进度应停留在失败前阶段，并显示失败最终态。

## API 对接建议

外部服务轮询任务时：

1. 使用 `GET /v1/jobs/<job_id>`。
2. 以 `status` 判断最终态。
3. 展示最新 stage event。
4. 失败时保留 `request_id` 和错误 code。
5. 如果已经配置 Webhook，可以减少轮询频率。

编译阶段失败时，如果返回了 `error.category`，优先按该字段排查。`output_validation_failed` 表示模型响应无法归一化或修复成要求的结构化 schema。对于 analysis 失败，先检查 effective prompt 是否包含顶层 `entities`、`concepts`、`claims`、`contradictions`、`relationships` 数组契约。如果任务继续执行并带有 `structured_output_final_status=source_backed_fallback`，表示 analysis 已经从 Parsed Content 中用来源追溯信息恢复，不会包含模型推断关系。对于 generation 失败，先检查 effective prompt 是否包含严格的顶层非空 `drafts` 数组契约，再检查所选模型和资料长度。

## 生产注意事项

- 任务时间线是排障证据，不建议定期清空。
- 大文件任务耗时更长，应把 API health 和 Worker health 分开观察。
- 删除资源时，相关运行任务需要取消或阻止继续写入。
- 如果大量任务同时失败，优先检查 `.env` 中模型、S3、数据库和 Redis 配置。
