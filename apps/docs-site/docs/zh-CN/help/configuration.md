# 配置说明

## 引言

本页解释部署级配置。知识库内的业务配置应在知识库设置中维护；数据库、队列、对象存储、模型、并发和安全项应通过 `.env` 管理。

## 配置原则

FocoContext 采用 env-first 配置。这样适合开源自部署和容器化部署，也能避免管理员在页面上看到或保存密钥明文。

| 配置类型                           | 推荐位置           | 后台展示                                   |
| ---------------------------------- | ------------------ | ------------------------------------------ |
| 管理员账号                         | `.env`             | 登录使用，不展示密码                       |
| Bearer API Key                     | `.env`             | 只展示是否配置和脱敏片段                   |
| PostgreSQL / Redis                 | `.env`             | 展示连接健康状态                           |
| S3-compatible 存储                 | `.env`             | 展示 endpoint、bucket 和健康状态           |
| Chat / Embedding / Rerank / Vision | `.env`             | 展示 provider、model 和可用性              |
| Worker 并发和限制                  | `.env`             | 展示当前运行值                             |
| 知识库 purpose、schema、检索预算   | 管理后台或 OpenAPI | 展示并允许保存                             |
| 提示词模板                         | 管理后台或 OpenAPI | 按知识库保存；provider 密钥仍保留在 `.env` |

## 步骤 1：填写基础安全配置

至少配置管理员账号和 OpenAPI Key：

```dotenv
FOCOCONTEXT_ADMIN_USERNAME=admin
FOCOCONTEXT_ADMIN_PASSWORD=change-me
FOCOCONTEXT_API_KEY=replace-with-a-long-random-token
```

管理员账号用于登录后台。Bearer API Key 用于外部服务调用 OpenAPI。二者用途不同，不应混用。

## 步骤 2：配置数据库和队列

```dotenv
DATABASE_URL=postgres://...
REDIS_URL=redis://...
```

PostgreSQL 保存业务数据、版本、页面、关系和任务记录。Redis 用于 BullMQ 队列、短期状态和异步 Worker 协调。

| 组件       | 失败表现                      | 排查入口                    |
| ---------- | ----------------------------- | --------------------------- |
| PostgreSQL | 后台列表加载失败、迁移失败    | 容器日志、Settings 健康状态 |
| Redis      | 任务一直排队、Worker 无法消费 | Worker 日志、队列健康状态   |

## 步骤 3：配置 S3-compatible 对象存储

原始文件、解析结果、图片、caption 输入输出和导出包都进入对象存储。

```dotenv
S3_ENDPOINT=https://s3.example.com
S3_BUCKET=fococontext
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

对象 key 会使用资源 ID 和随机后缀，避免同名文件覆盖。后台展示原始文件名，内部保存 object key 映射，删除时按映射进入异步清理。

## 步骤 4：配置模型供应商

模型接口遵循 OpenAI-compatible 形式，Chat、Embedding、Rerank、Vision 分开配置。

| Provider  | 用途                               |
| --------- | ---------------------------------- |
| Chat      | 分析资料、生成 Wiki 页面、合并摘要 |
| Embedding | 生成语义索引                       |
| Rerank    | 对候选结果重排                     |
| Vision    | 图片 caption 和视觉辅助理解        |

常见配置项包括 base URL、API key、model name、timeout、retry、streaming 开关和并发限制。不同供应商的模型能力不同，应先用小文件验证。

## 步骤 5：配置数据集提示词模板

提示词模板属于 Knowledge Base 的业务配置。它控制 FocoContext 如何使用已经配置好的模型完成资料分析、Wiki 页面生成、页面合并、图片 caption、Knowledge Check 和 Wiki Draft 编译。

进入 **知识库设置 → 提示词模板**。选择提示词用途，查看内置模板，然后选择三种模式之一：

| 模式                  | 适用场景                         | 安全行为                                            |
| --------------------- | -------------------------------- | --------------------------------------------------- |
| `built_in`            | 完全使用内置提示词               | 不追加管理员文本                                    |
| `custom_instructions` | 增加领域术语、风格规则或格式偏好 | 保留锁定的来源追溯和输出契约                        |
| `override_template`   | 自部署场景中替换可编辑模板主体   | API 会在保存前校验来源、证据、schema 和输出契约要求 |

生产调优优先使用 custom instructions。只有在完整测试入库链路后再使用 override mode，因为错误输出可能破坏结构化分析或生成。

| 用途              | 运行阶段                      |
| ----------------- | ----------------------------- |
| `analysis`        | 资料分析和知识对象抽取        |
| `generation`      | 基于分析结果生成 Wiki 草稿    |
| `merge`           | 页面合并和版本应用摘要        |
| `vision_caption`  | 为抽取出的图片生成 caption    |
| `knowledge_check` | 语义 Knowledge Check 问题发现 |
| `wiki_draft`      | 开发者提交的 Wiki Draft 编译  |

每次保存提示词都会创建新的数据集配置版本和快照。任务启动时从该快照解析提示词，运行中的任务会继续使用启动时的 prompt snapshot。模型调用和任务 metadata 会记录提示词用途、模式、内置提示词 ID、effective prompt version、effective prompt hash 和数据集配置快照 ID。公开 Retrieve 响应会省略完整 effective prompt 文本。

## 步骤 6：配置运行时并发

生产环境不应把所有并发固定为 1。并发需要根据 CPU、内存、模型限流、OCR 消耗和 S3 带宽调整。

| 并发项                     | 影响                        |
| -------------------------- | --------------------------- |
| ingest worker concurrency  | 同时处理多少入库任务        |
| parser concurrency         | 同时解析多少文件            |
| OCR concurrency            | 同时处理多少 OCR 页面或任务 |
| vision caption concurrency | 同时 caption 多少图片       |
| model request concurrency  | 同时发送多少模型请求        |
| source watch concurrency   | 同时扫描多少规则            |

先从保守值开始，观察任务耗时和 provider 限流，再逐步增加。

## 步骤 7：在后台验证配置

进入设置页，逐项确认：

1. 运行状态为健康。
2. 数据库和队列可连接。
3. S3 bucket 可写入和读取。
4. 模型配置显示 provider 和 model。
5. Worker 并发值符合预期。
6. 知识库设置里的提示词模板可以预览、保存和校验。
7. OpenAPI base URL 和 CORS 与部署方式一致。

## 生产注意事项

- `.env` 可以放在服务器本地，不应提交到仓库。
- 公开部署时建议由反向代理处理 HTTPS、域名、请求大小和访问控制。
- API Key 应只存放在服务端，不要放进浏览器客户端。
- 修改模型或并发后，建议重启 Worker，并用一个小文件重新验证入库。
- 如果更换 S3 bucket，应先清理旧 bucket 或确认历史对象不再需要。
