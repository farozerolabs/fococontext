# 检索调试

## 引言

检索调试用于把后台看到的知识资产转换成可复制的 Retrieve 请求。它面向后端开发者，不面向最终用户。

## 步骤 1：选择 Knowledge Base

先选择已 completed 且 retrieve readiness 为 ready 的知识库。没有完成入库的知识库可能返回空结果。

检查项：

| 检查项          | 说明                             |
| --------------- | -------------------------------- |
| latest version  | 当前检索使用的知识版本           |
| source count    | 至少有一份已完成资料             |
| graph index     | 图谱索引 ready 时可使用图谱扩展  |
| embedding index | 语义召回需要 embedding index     |
| language        | 查询语言和知识库输出语言是否匹配 |

## 步骤 2：输入查询

输入包含对象、动作或约束的真实业务问题。

| 查询类型 | 示例                                       |
| -------- | ------------------------------------------ |
| 概念解释 | “这个系统的资料入库流程是什么？”           |
| 关系查询 | “哪些模块会影响 Source Watch 的扫描结果？” |
| 排障查询 | “任务卡在 analyzing 时应该检查什么？”      |
| 来源查询 | “这条配置建议来自哪些资料？”               |

## 步骤 3：设置检索参数

| 参数              | 作用                                    |
| ----------------- | --------------------------------------- |
| topK              | 候选页面数量                            |
| graph expansion   | 是否沿图谱扩展相关页面                  |
| rerank            | 是否对候选结果重排                      |
| context budget    | 最终 `context_pack` 的 token 或字符预算 |
| include citations | 是否返回引用和来源 locator              |
| include media     | 是否纳入图片 caption 和媒体来源         |
| fork scope        | 是否在某个 Fork 范围内检索              |

第一次调试建议保持默认值。确认召回正确后，再逐步调整预算和图谱扩展。

## 步骤 4：阅读结果

Retrieve 返回的结果应从上到下检查：

| 区块            | 判断方式                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------- |
| answerability   | 先判断上下文是 `answerable`、`partial` 还是 `not_answerable`，再决定 Agent 能否使用候选生成回答 |
| candidates      | 候选页面是否和问题相关                                                                          |
| citations       | 引用是否能追溯到 Source Document                                                                |
| graph expansion | 扩展页面是否有解释，不应无意义膨胀                                                              |
| media hits      | 图片 caption 是否能指向原图和来源页                                                             |
| context_pack    | 是否可以直接传给你的上层模型                                                                    |
| diagnostics     | 预算截断、rerank、CJK 或混合语言召回信息                                                        |

如果候选页面正确但 `context_pack` 太短，增加 context budget。候选页面不正确时，先检查页面标题、摘要、关键词、图谱关系和 embedding 状态。

启用 `include_trace` 后，重点检查这些安全诊断字段：

| trace 或响应字段                          | 检查内容                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `trace.stages[name=metadata_matching]`    | source name、source path、source summary、slug 和 metadata 命中统计                                         |
| `trace.stages[name=rank_fusion]`          | lexical count、semantic count、fused count 和 duplicate-control summary                                     |
| `trace.stages[name=rerank].output.status` | `disabled`、`skipped`、`applied`、`failed` 或 `timed_out`                                                   |
| `trace.stages[name=answerability]`        | 置信度贡献、阈值、原因代码和推荐动作                                                                        |
| `answerability.no_answer`                 | 为 true 时，返回候选只用于诊断，不应作为充分证据生成最终回答                                                |
| `trace.stages[name=context_pruning]`      | omitted context 数量、reason 统计和 truncated categories                                                    |
| `warnings`                                | 请求级 warning code，例如 `retrieve.rerank_failed`                                                          |
| `context_budget.omitted_items[].reason`   | 解释上下文省略原因，包括预算耗尽、重复上下文或来源噪声、保留给展开的图邻居、较弱来源匹配和缺失 locator 证据 |
| `context_pack.entries`                    | 排序、图谱扩展和剪枝之后最终进入 prompt-ready payload 的条目                                                |

## 步骤 5：复制请求

调试通过后，复制请求到你的服务端。不要在浏览器前端保存 Bearer API Key。

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/retrieve" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query":"What should I check when ingest is stuck?","top_k":5}'
```

## 常见问题

| 现象                | 可能原因                                                                                |
| ------------------- | --------------------------------------------------------------------------------------- |
| 没有结果            | 知识库未完成入库、索引未 ready、查询语言不匹配                                          |
| 语义索引告警        | `retrieve.index.semantic_not_ready` 表示 embedding index 为空，但词法和图谱仍可继续运行 |
| 引用缺失            | 页面缺少来源、资料被删除、解析 locator 不完整                                           |
| 图谱扩展太多        | graph expansion 或 community 参数过宽                                                   |
| 中文召回差          | 检查 CJK lexical retrieval、标题、同义词和 mixed-language 内容                          |
| context_pack 被截断 | context budget 太小或候选内容过长                                                       |
| rerank 未执行       | 检查空 `RERANK_*` env、trace rerank status、timeout 和 warnings                         |
| 上下文重复          | 增加 `topK` 前先查看 `duplicate_context` 和 `duplicate_source_noise` omitted items      |

## 生产注意事项

- Retrieve 是给开发者服务端调用的 API，不负责生成最终面向用户的回答。
- 如果 `answerability.no_answer` 为 true，应追问、放宽过滤、等待入库就绪或拒绝无证据结论，不能用返回候选生成带来源背书的最终回答。
- 如果 `answerability.status` 为 `partial`，只有在 citation 和 context 足以覆盖用户问题范围时，才带限定条件回答。
- 上层应用应保存 query、request_id、引用和最终回答，便于排查。
- 如果启用 Webhook，可以在入库完成后再触发业务侧缓存刷新。
