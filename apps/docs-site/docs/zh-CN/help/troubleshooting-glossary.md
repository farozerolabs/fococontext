# 故障排查与术语表

## 引言

本页用于快速定位常见问题。先按现象查表，再进入对应页面查看详细流程。

## 快速排查顺序

1. 设置页：确认 API、Worker、PostgreSQL、Redis、S3、模型配置状态。
2. 任务页：查看最新失败任务、阶段和 `request_id`。
3. 资料页：确认 Source 状态、解析警告和媒体资产。
4. Wiki 页面：确认是否真正生成长期知识资产。
5. Graph View：确认图谱索引和洞察是否存在。
6. 检索调试：确认候选、引用、context budget 和诊断信息。

## 常见问题

| 现象                       | 优先检查                                                           |
| -------------------------- | ------------------------------------------------------------------ |
| 登录显示凭据无效           | `.env` 管理员账号密码、容器是否重启到最新配置                      |
| 新建知识库失败             | slug 格式、必填字段、API 错误 toast                                |
| 上传后没有进度             | 浏览器请求、S3 写入、任务是否创建                                  |
| 任务卡在 queued            | Worker health、Redis、队列并发                                     |
| 任务卡在 parsing           | 文件格式、大小限制、OCR 服务、解析器日志                           |
| 任务卡在 analyzing         | Chat provider、模型限流、流式配置、`output_validation_failed` 修复 |
| 任务 completed 但没有 Wiki | merge/index 元数据、页面列表过滤、版本记录                         |
| 图谱为空                   | 页面关系不足、Graph index status、图谱构建事件                     |
| 检索无结果                 | 索引 readiness、Embedding provider、查询语言、context budget       |
| 删除后旧页面还能操作       | 资源状态缓存，刷新后后台会二次拦截                                 |
| Webhook 重复               | 使用 event ID 做幂等                                               |

## 错误包

API 错误会返回结构化错误，排查时保留 `request_id`。

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Knowledge base slug is invalid.",
    "details": {
      "fields": ["slug"]
    }
  },
  "request_id": "req_example"
}
```

后台 toast 应展示用户可读消息；开发者调试时看 code、details 和 request_id。

## 术语表

| 术语              | 含义                                             |
| ----------------- | ------------------------------------------------ |
| Knowledge Base    | 顶层知识库数据集                                 |
| Source Document   | 原始资料和证据记录                               |
| Parsed Content    | 解析后的结构化内容                               |
| Media Asset       | 图片、表格、附件等媒体资源                       |
| Wiki Page         | 编译后的长期知识页面                             |
| Graph Edge        | 页面之间的关系                                   |
| Knowledge Check   | 非阻塞质量发现                                   |
| Change Set        | 一次知识变化集合                                 |
| Knowledge Version | 知识库整体版本                                   |
| Page Version      | 单页历史版本                                     |
| Fork              | 隔离终端用户或工作区新增知识                     |
| Source Watch      | 外部资料位置扫描规则                             |
| Retrieve          | 返回候选、引用、图谱扩展和 `context_pack` 的 API |
| Context Budget    | 控制返回上下文长度的预算                         |
| CJK retrieval     | 中文、日文、韩文和混合语言的词法召回能力         |

## 提交问题时需要提供

- 版本或 commit。
- Docker 服务状态。
- 失败 API 的 `request_id`。
- 任务 ID、Source ID、Knowledge Base ID。
- 相关容器日志。
- 是否使用真实 S3、真实模型、OCR 或 Vision。

## 生产注意事项

- 不要把“上传成功”等同于“入库完成”。
- 不要把“向量索引完成”等同于“知识库完成”。
- 先修复配置和任务失败，再调检索参数。
- 对大文件问题，分别观察 API health、Worker health、S3 带宽和模型耗时。
