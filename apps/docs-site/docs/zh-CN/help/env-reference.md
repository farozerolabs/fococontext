# Env 字段说明

## 运行端口

| 字段                        | 说明             | 建议值                                                                 |
| --------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `FOCOCONTEXT_BIND_HOST`     | Compose 监听地址 | 反向代理部署使用 `127.0.0.1`；只有明确直接开放服务端口时使用 `0.0.0.0` |
| `FOCOCONTEXT_API_PORT`      | 数字端口         | 本地使用 `18080`；生产由反向代理映射                                   |
| `FOCOCONTEXT_ADMIN_PORT`    | 数字端口         | 本地使用 `18081`；生产通常只暴露前端域名                               |
| `FOCOCONTEXT_POSTGRES_PORT` | 数字端口         | 本地使用 `18432`；生产数据库不建议公网暴露                             |
| `FOCOCONTEXT_REDIS_PORT`    | 数字端口         | 本地使用 `18379`；生产 Redis 不建议公网暴露                            |

`FOCOCONTEXT_*_PORT` 继续只填写数字端口。监听地址写在
`FOCOCONTEXT_BIND_HOST` 中，不要把 `127.0.0.1:18080` 这类值填进
`FOCOCONTEXT_API_PORT` 或 `FOCOCONTEXT_ADMIN_PORT`。

## 发布镜像

| 字段                          | 说明                   | 建议值                                                         |
| ----------------------------- | ---------------------- | -------------------------------------------------------------- |
| `FOCOCONTEXT_IMAGE_TAG`       | 已发布 Docker 镜像 tag | `docker-compose.example.yml` 必填；使用去掉 `v` 的 release tag |
| `FOCOCONTEXT_IMAGE_NAMESPACE` | Docker 镜像命名空间    | 公开 GHCR 镜像使用 `ghcr.io/farozerolabs`                      |

## 管理员和 OpenAPI 访问

| 字段                                             | 说明                       | 建议值                                                                    |
| ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------- |
| `FOCOCONTEXT_ADMIN_USERNAME`                     | 管理员用户名               | 本地可用 `admin`；生产使用不易猜的管理员名                                |
| `FOCOCONTEXT_ADMIN_PASSWORD`                     | 管理员密码                 | 至少 16 位随机密码，不要提交到 Git                                        |
| `FOCOCONTEXT_ADMIN_SESSION_TTL_SECONDS`          | 管理后台会话 TTL 秒数      | 默认 `604800`，即 7 天                                                    |
| `FOCOCONTEXT_ADMIN_LOGIN_FAILURE_LIMIT`          | 登录失败阈值               | 默认 `5`；重复失败会限流且不暴露账号是否存在                              |
| `FOCOCONTEXT_ADMIN_LOGIN_FAILURE_WINDOW_SECONDS` | 登录失败统计窗口秒数       | 默认 `300`                                                                |
| `FOCOCONTEXT_ADMIN_LOGIN_LOCKOUT_SECONDS`        | 登录锁定秒数               | 默认 `900`                                                                |
| `FOCOCONTEXT_ADMIN_COOKIE_SECURE`                | Admin Cookie Secure 属性   | HTTPS 生产环境使用 `true`                                                 |
| `FOCOCONTEXT_ADMIN_COOKIE_SAMESITE`              | Admin Cookie SameSite 模式 | 默认 `lax`；按反向代理和域名部署方式调整                                  |
| `FOCOCONTEXT_API_KEY`                            | Bearer API Key             | 使用 32 位以上随机值，只保存在服务端                                      |
| `FOCOCONTEXT_CORS_ORIGINS`                       | 逗号分隔 origin            | 本地填 `http://localhost:18081,http://127.0.0.1:18081`；生产只填可信域名  |
| `FOCOCONTEXT_ADMIN_API_BASE_URL`                 | Admin 调用 API 的 base URL | Compose 内本地用 `http://localhost:18080/v1`；反向代理部署填公开 API 路径 |
| `FOCOCONTEXT_ADMIN_BASE_URL`                     | Admin 自身访问地址         | 本地用 `http://localhost:18081`；生产填 HTTPS 域名                        |

## 安全响应头、审计与限流

| 字段                                      | 说明                     | 建议值                          |
| ----------------------------------------- | ------------------------ | ------------------------------- |
| `SECURITY_HEADERS_ENABLED`                | 是否启用安全响应头       | 默认 `true`                     |
| `SECURITY_HSTS_ENABLED`                   | 是否启用 HSTS            | HTTPS 稳定后再开启              |
| `SECURITY_HSTS_MAX_AGE_SECONDS`           | HSTS max age             | 默认 `15552000`                 |
| `SECURITY_AUDIT_ENABLED`                  | 是否持久化安全审计事件   | 默认 `true`                     |
| `SECURITY_AUDIT_RETENTION_DAYS`           | 安全审计保留天数         | 默认 `90`                       |
| `SECURITY_AUDIT_MAX_METADATA_BYTES`       | 审计 metadata 大小上限   | 默认 `4096`                     |
| `SECURITY_AUDIT_COUNTER_WINDOW_SECONDS`   | Redis 审计计数窗口       | 默认 `300`                      |
| `SECURITY_AUDIT_COUNTER_TTL_SECONDS`      | Redis 审计计数 TTL       | 默认 `3600`                     |
| `SECURITY_RATE_LIMIT_ENABLED`             | 是否启用路由限流         | 默认 `true`                     |
| `SECURITY_RATE_LIMIT_WINDOW_SECONDS`      | 限流窗口秒数             | 默认 `60`                       |
| `SECURITY_RATE_LIMIT_PUBLIC_HEALTH_MAX`   | public health 窗口上限   | 默认 `120`                      |
| `SECURITY_RATE_LIMIT_OPENAPI_MAX`         | OpenAPI JSON 窗口上限    | 默认 `30`                       |
| `SECURITY_RATE_LIMIT_LOGIN_MAX`           | 登录窗口上限             | 默认 `10`                       |
| `SECURITY_RATE_LIMIT_DIAGNOSTICS_MAX`     | 诊断接口窗口上限         | 默认 `30`                       |
| `SECURITY_RATE_LIMIT_DEFAULT_API_MAX`     | 默认受保护 API 窗口上限  | 默认 `300`                      |
| `SECURITY_RATE_LIMIT_RETRIEVE_MAX`        | Retrieve 窗口上限        | 默认 `60`                       |
| `SECURITY_RATE_LIMIT_SOURCE_EVIDENCE_MAX` | Source Evidence 窗口上限 | 默认 `120`                      |
| `SECURITY_RATE_LIMIT_UPLOAD_MAX`          | 内置上传窗口上限         | 默认 `30`                       |
| `SECURITY_RATE_LIMIT_DIRECT_UPLOAD_MAX`   | 直传窗口上限             | 默认 `30`                       |
| `SECURITY_RATE_LIMIT_EXPORT_MAX`          | 导出窗口上限             | 默认 `10`                       |
| `SECURITY_RATE_LIMIT_CLEANUP_MAX`         | 清理窗口上限             | 默认 `10`                       |
| `SECURITY_RATE_LIMIT_WEBHOOK_MAX`         | Webhook 窗口上限         | 默认 `60`                       |
| `SECURITY_RATE_LIMIT_ADMIN_EXPENSIVE_MAX` | 管理后台昂贵操作窗口上限 | 默认 `30`；可信运维场景谨慎调高 |

## Source Watch 挂载目录

| 字段                                     | 说明       | 建议值                                                 |
| ---------------------------------------- | ---------- | ------------------------------------------------------ |
| `FOCOCONTEXT_SOURCE_WATCH_HOST_DIR`      | 宿主机目录 | 本地用 `./examples/source-watch`；生产填专门的数据目录 |
| `FOCOCONTEXT_SOURCE_WATCH_CONTAINER_DIR` | 容器内目录 | 保持 `/source-watch`，创建规则时填该路径或子路径       |

## Source Watch 远程网络安全

| 字段                                     | 说明                     | 建议值                                   |
| ---------------------------------------- | ------------------------ | ---------------------------------------- |
| `SOURCE_WATCH_PRIVATE_NETWORK_ENABLED`   | 是否允许私网目标         | 默认 `false`；只在可信内网资料源场景开启 |
| `SOURCE_WATCH_PRIVATE_NETWORK_ALLOWLIST` | host、IP 或 CIDR 白名单  | 默认留空；开启私网目标时必须显式配置     |
| `PARSER_REMOTE_IMAGE_FETCHING_ENABLED`   | 是否抓取输入中的远程图片 | 默认 `false`；只有明确出口控制时才开启   |

## Source Watch URL 列表

| 字段                                        | 说明                  | 建议值                                    |
| ------------------------------------------- | --------------------- | ----------------------------------------- |
| `SOURCE_WATCH_URL_LIST_ENABLED`             | `true` / `false`      | 未准备 URL 安全策略前保持 `false`         |
| `SOURCE_WATCH_URL_LIST_PROTOCOLS`           | 逗号分隔协议          | 生产通常填 `https`；本地可用 `http,https` |
| `SOURCE_WATCH_URL_LIST_MAX_URLS`            | 单规则 URL 数量上限   | 默认 `100`，大批量拆成多个规则            |
| `SOURCE_WATCH_URL_LIST_MAX_RESPONSE_BYTES`  | 单 URL 最大响应字节数 | 默认 `1048576`；生产按资料大小调高        |
| `SOURCE_WATCH_URL_LIST_TIMEOUT_SECONDS`     | 请求超时秒数          | 默认 `15`；慢站点可调到 `30`              |
| `SOURCE_WATCH_URL_LIST_REDIRECT_LIMIT`      | 重定向次数            | 默认 `3`                                  |
| `SOURCE_WATCH_URL_LIST_MAX_RETRIES`         | 失败重试次数          | 默认 `2`                                  |
| `SOURCE_WATCH_URL_LIST_RETRY_BASE_DELAY_MS` | 重试基础延迟毫秒      | 默认 `500`                                |
| `SOURCE_WATCH_URL_LIST_CONCURRENCY`         | URL 抓取并发          | 默认 `2`；高配服务器可逐步调高            |

## Source Watch S3

| 字段                                       | 说明                    | 建议值                                         |
| ------------------------------------------ | ----------------------- | ---------------------------------------------- |
| `SOURCE_WATCH_S3_ENABLED`                  | `true` / `false`        | 未接用户资料源 S3 前保持 `false`               |
| `SOURCE_WATCH_S3_ENDPOINT`                 | S3-compatible endpoint  | 填用户资料源 endpoint                          |
| `SOURCE_WATCH_S3_REGION`                   | region                  | 按资料源填写；R2 等可填 `auto`                 |
| `SOURCE_WATCH_S3_BUCKET`                   | bucket 名称             | 使用只读或最小权限 bucket                      |
| `SOURCE_WATCH_S3_ACCESS_KEY_ID`            | access key              | 使用资料源专用 key                             |
| `SOURCE_WATCH_S3_SECRET_ACCESS_KEY`        | secret key              | 使用资料源专用 secret                          |
| `SOURCE_WATCH_S3_FORCE_PATH_STYLE`         | `true` / `false`        | 兼容服务常用 `true`，AWS S3 通常 `false`       |
| `SOURCE_WATCH_S3_MAX_OBJECTS`              | 单次扫描对象上限        | 默认 `1000`                                    |
| `SOURCE_WATCH_S3_MAX_OBJECT_BYTES`         | 单对象大小上限          | 默认 `20971520`，约 20 MB                      |
| `SOURCE_WATCH_S3_TIMEOUT_SECONDS`          | 请求超时秒数            | 默认 `30`                                      |
| `SOURCE_WATCH_S3_MAX_RETRIES`              | 失败重试次数            | 默认 `2`                                       |
| `SOURCE_WATCH_S3_RETRY_BASE_DELAY_MS`      | 重试基础延迟毫秒        | 默认 `500`                                     |
| `SOURCE_WATCH_S3_CONCURRENCY`              | S3 扫描并发             | 默认 `2`                                       |
| `SOURCE_WATCH_S3_INCREMENTAL_SCAN_ENABLED` | metadata-first 重复扫描 | 默认 `true`；fingerprint 未变化时不读对象 body |

## Source Watch Git

| 字段                                   | 说明                   | 建议值                                |
| -------------------------------------- | ---------------------- | ------------------------------------- |
| `SOURCE_WATCH_GIT_ENABLED`             | `true` / `false`       | 未准备 token 和路径过滤前保持 `false` |
| `SOURCE_WATCH_GIT_PROTOCOLS`           | `https` 或允许协议列表 | 生产建议只填 `https`                  |
| `SOURCE_WATCH_GIT_TOKEN`               | Git 访问 token         | 公开仓库可留空；私有仓库用只读 token  |
| `SOURCE_WATCH_GIT_CLONE_DEPTH`         | clone 深度             | 默认 `1`                              |
| `SOURCE_WATCH_GIT_TEMP_DIR`            | 容器临时目录           | 默认 `/tmp/fococontext-git-watch`     |
| `SOURCE_WATCH_GIT_MAX_FILES`           | 单次扫描文件数上限     | 默认 `2000`                           |
| `SOURCE_WATCH_GIT_MAX_FILE_BYTES`      | 单文件大小上限         | 默认 `20971520`，约 20 MB             |
| `SOURCE_WATCH_GIT_TIMEOUT_SECONDS`     | clone / 扫描超时       | 默认 `60`                             |
| `SOURCE_WATCH_GIT_MAX_RETRIES`         | 失败重试次数           | 默认 `1`                              |
| `SOURCE_WATCH_GIT_RETRY_BASE_DELAY_MS` | 重试基础延迟毫秒       | 默认 `1000`                           |
| `SOURCE_WATCH_GIT_CONCURRENCY`         | Git 扫描并发           | 默认 `2`                              |

## PostgreSQL 和 Redis

| 字段                | 说明              | 建议值                                            |
| ------------------- | ----------------- | ------------------------------------------------- |
| `POSTGRES_USER`     | 数据库用户名      | 本地用 `fococontext`；生产用专用账号              |
| `POSTGRES_PASSWORD` | 数据库密码        | 随机强密码                                        |
| `POSTGRES_DB`       | 数据库名          | 默认 `fococontext`                                |
| `DATABASE_URL`      | PostgreSQL 连接串 | Compose 用 `postgres:5432`；生产填内网数据库地址  |
| `REDIS_URL`         | Redis 连接串      | Compose 用 `redis://redis:6379`；生产填内网 Redis |

## 系统对象存储 S3

| 字段                   | 说明                   | 建议值                                     |
| ---------------------- | ---------------------- | ------------------------------------------ |
| `S3_PROVIDER_NAME`     | 展示名称               | 例如 `AWS S3`、`Cloudflare R2`、`Ceph RGW` |
| `S3_ENDPOINT`          | S3-compatible endpoint | 填真实对象存储 endpoint                    |
| `S3_REGION`            | region                 | 按服务商填写；R2 可填 `auto`               |
| `S3_BUCKET`            | bucket 名称            | 使用 FocoContext 专用 bucket               |
| `S3_ACCESS_KEY_ID`     | access key             | 使用专用最小权限 key                       |
| `S3_SECRET_ACCESS_KEY` | secret key             | 使用专用 secret                            |
| `S3_FORCE_PATH_STYLE`  | `true` / `false`       | AWS S3 通常 `false`；兼容服务按要求填写    |
| `S3_PUBLIC_BASE_URL`   | 可公开访问的 base URL  | 没有公开预览域名可留空                     |

## S3-compatible 操作调优

这些配置是 provider-neutral 的。Class A 表示写入、列表、multipart、复制、生命周期和 bucket 变更类操作；Class B 表示对象读取和 metadata 读取类操作。实际价格、免费额度和计费名称以当前配置的 S3-compatible provider 为准。

| 字段                                     | 说明                          | 建议值                                  |
| ---------------------------------------- | ----------------------------- | --------------------------------------- |
| `S3_OPERATION_METRICS_ENABLED`           | 是否记录操作计数              | 默认 `true`                             |
| `S3_OPERATION_PRESSURE_WARNINGS_ENABLED` | 是否开启操作压力告警          | 默认 `true`                             |
| `S3_OPERATION_METRICS_WINDOW_SECONDS`    | 最近指标窗口秒数              | 默认 `300`                              |
| `S3_OPERATION_CLASS_A_WARNING_THRESHOLD` | 窗口内 Class A 告警阈值       | 默认 `1000`                             |
| `S3_OPERATION_CLASS_B_WARNING_THRESHOLD` | 窗口内 Class B 告警阈值       | 默认 `10000`                            |
| `S3_PREVIEW_CACHE_ENABLED`               | 是否使用持久化 parsed preview | 默认 `true`                             |
| `S3_PREVIEW_MAX_CHARS`                   | markdown preview 最大字符数   | 默认 `200000`                           |
| `S3_MULTIPART_PART_SIZE_BYTES`           | multipart upload 分片大小     | 默认 `16777216`；S3 multipart 最小 5 MB |

## Chat、Embedding、Rerank

| 字段                       | 说明                                 | 建议值                                       |
| -------------------------- | ------------------------------------ | -------------------------------------------- |
| `CHAT_PROVIDER_NAME`       | Chat provider 展示名                 | 例如 `OpenAI`、`OpenRouter`、`Local Gateway` |
| `CHAT_BASE_URL`            | OpenAI-compatible base URL           | 填供应商 `/v1` 地址                          |
| `CHAT_API_KEY`             | Chat provider key                    | 使用服务端 secret                            |
| `CHAT_DEFAULT_MODEL`       | 默认文本模型                         | 可与分析、生成、合并模型相同                 |
| `CHAT_ANALYSIS_MODEL`      | 资料分析模型                         | 选结构化输出稳定、上下文足够的模型           |
| `CHAT_GENERATION_MODEL`    | Wiki 生成模型                        | 选长文本生成质量稳定的模型                   |
| `CHAT_MERGE_MODEL`         | 页面合并模型                         | 选遵循指令和保留引用能力强的模型             |
| `CHAT_REQUEST_MAX_RETRIES` | 可重试失败的额外重试次数             | 默认 `2`；限流多可调高                       |
| `EMBEDDING_PROVIDER_NAME`  | Embedding provider 展示名            | 例如 `OpenAI`、`Jina`、`Local Embedding`     |
| `EMBEDDING_BASE_URL`       | OpenAI-compatible embedding base URL | 填供应商 `/v1` 地址                          |
| `EMBEDDING_API_KEY`        | Embedding provider key               | 使用服务端 secret                            |
| `EMBEDDING_MODEL`          | embedding 模型名                     | 和 `EMBEDDING_DIMENSIONS` 匹配               |
| `EMBEDDING_DIMENSIONS`     | 向量维度                             | 按模型填写；默认 `1536`                      |
| `RERANK_PROVIDER_NAME`     | Rerank provider 展示名               | 不启用 rerank 可留空                         |
| `RERANK_BASE_URL`          | rerank base URL                      | 不启用可留空                                 |
| `RERANK_API_KEY`           | rerank key                           | 不启用可留空                                 |
| `RERANK_MODEL`             | rerank 模型名                        | 不启用可留空                                 |

Rerank 使用全有或全无配置规则。所有 `RERANK_*` 都留空时禁用 rerank；同时配置 `RERANK_PROVIDER_NAME`、`RERANK_BASE_URL`、`RERANK_API_KEY` 和 `RERANK_MODEL` 时启用 Retrieve 的可选重排。只配置一部分属于无效配置，因为 Retrieve 无法安全报告一个可用的 rerank provider。

## Vision Caption

| 字段                                     | 说明                       | 建议值                          |
| ---------------------------------------- | -------------------------- | ------------------------------- |
| `VISION_CAPTION_ENABLED`                 | `true` / `false`           | 没有视觉模型时保持 `false`      |
| `VISION_CAPTION_PROVIDER_NAME`           | Vision provider 展示名     | 例如 `OpenAI Vision`、`Qwen VL` |
| `VISION_CAPTION_BASE_URL`                | OpenAI-compatible base URL | 填支持图片输入的 provider 地址  |
| `VISION_CAPTION_API_KEY`                 | Vision provider key        | 使用服务端 secret               |
| `VISION_CAPTION_MODEL`                   | 支持图片输入的模型名       | 选能稳定描述文档图片的模型      |
| `VISION_CAPTION_MAX_RETRIES`             | 重试次数                   | 默认 `2`                        |
| `VISION_CAPTION_RETRY_BASE_DELAY_MS`     | 重试基础延迟毫秒           | 默认 `500`                      |
| `VISION_CAPTION_CONCURRENCY`             | caption 任务并发           | 默认 `1`；按 provider 限流调整  |
| `VISION_CAPTION_IMAGE_CONCURRENCY`       | 单任务图片并发             | 默认 `1`；大文档可谨慎调高      |
| `VISION_CAPTION_TIMEOUT_SECONDS`         | 单次请求超时               | 默认 `60`                       |
| `VISION_CAPTION_MAX_IMAGES_PER_DOCUMENT` | 单文档图片上限             | 默认 `100`                      |
| `VISION_CAPTION_CONTEXT_CHARS`           | 图片周边上下文字数         | 默认 `200`                      |
| `VISION_CAPTION_MAX_OUTPUT_TOKENS`       | caption 输出上限           | 默认 `160`                      |

## OCR

| 字段                          | 说明                  | 建议值                                                          |
| ----------------------------- | --------------------- | --------------------------------------------------------------- |
| `OCR_ENABLED`                 | `true` / `false`      | 默认模板随内置 OCR 服务设为 `true`；明确关闭 OCR 时设为 `false` |
| `OCR_PROVIDER`                | provider 名称         | 默认 `rapidocr`                                                 |
| `OCR_SERVICE_BASE_URL`        | OCR 服务 URL          | 内置 Compose OCR 服务用 `http://ocr-service:18082`              |
| `OCR_SERVICE_API_KEY`         | OCR 服务 key          | 无鉴权可留空；生产建议配置                                      |
| `OCR_LANGS`                   | 逗号分隔语言          | 中文资料用 `ch,en`                                              |
| `OCR_PAGE_DPI`                | PDF 渲染 DPI          | 默认 `180`；更高清会更慢                                        |
| `OCR_MAX_PAGES_PER_DOCUMENT`  | 单文档 OCR 页数上限   | 默认 `200`                                                      |
| `OCR_MAX_PAGE_PIXELS`         | 单页像素上限          | 默认 `20000000`                                                 |
| `OCR_CONCURRENCY`             | OCR job 并发          | 默认 `1`                                                        |
| `OCR_PAGE_CONCURRENCY`        | 单 job 页级并发       | 默认 `1`                                                        |
| `OCR_TIMEOUT_SECONDS`         | OCR 超时              | 默认 `60`                                                       |
| `OCR_MAX_RETRIES`             | OCR 重试次数          | 默认 `2`                                                        |
| `OCR_RETRY_BASE_DELAY_MS`     | 重试基础延迟毫秒      | 默认 `500`                                                      |
| `OCR_MIN_TEXT_CHARS_PER_PAGE` | 触发 OCR 的低文本阈值 | 默认 `80`                                                       |
| `OCR_CONFIDENCE_THRESHOLD`    | OCR 置信度阈值        | 默认 `0.5`                                                      |
| `OCR_STORE_PAGE_IMAGES`       | 是否保存 OCR 页面图片 | 默认 `false`；涉及隐私时不要开启                                |

## 异步删除清理

| 字段                                        | 说明                    | 建议值                   |
| ------------------------------------------- | ----------------------- | ------------------------ |
| `DELETION_CLEANUP_CONCURRENCY`              | 清理并发                | 默认 `1`；大存储可调高   |
| `DELETION_CLEANUP_OBJECT_BATCH_SIZE`        | 每批 S3 对象数          | 默认 `100`               |
| `DELETION_CLEANUP_MAX_RETRIES`              | 最大重试次数            | 默认 `3`                 |
| `DELETION_CLEANUP_RETRY_BASE_DELAY_MS`      | 重试基础延迟毫秒        | 默认 `1000`              |
| `DELETION_CLEANUP_RETRY_BACKOFF`            | `fixed` / `exponential` | 推荐 `exponential`       |
| `DELETION_CLEANUP_OPERATION_RETENTION_DAYS` | 操作摘要保留天数        | 空值表示长期保留精简摘要 |
| `DELETION_CLEANUP_ITEM_RETENTION_DAYS`      | 清理明细保留天数        | 默认 `30`                |

## 上传、运行压力和解析器

| 字段                                         | 说明                           | 建议值                               |
| -------------------------------------------- | ------------------------------ | ------------------------------------ |
| `UPLOAD_MAX_FILE_SIZE_MB`                    | 上传文件大小上限 MB            | 默认 `50`；生产按 API 网关和 S3 调整 |
| `UPLOAD_MAX_CONCURRENT_FILES`                | 浏览器并发上传数               | 默认 `3`                             |
| `UPLOAD_DIRECT_ENABLED`                      | `true` / `false`               | 有直传能力后开启                     |
| `UPLOAD_DIRECT_THRESHOLD_MB`                 | 超过多少 MB 走直传             | 默认 `50`                            |
| `UPLOAD_SESSION_EXPIRES_SECONDS`             | 上传会话过期秒数               | 默认 `900`                           |
| `UPLOAD_MULTIPART_FALLBACK_MODE`             | `enabled` / `disabled`         | 默认 `enabled`                       |
| `UPLOAD_MULTIPART_TIMEOUT_SECONDS`           | multipart 超时                 | 默认 `300`                           |
| `UPLOAD_PRESSURE_DEGRADED_THRESHOLD`         | 上传压力 degraded 阈值         | 默认 `3`                             |
| `RUNTIME_QUEUE_DEPTH_DEGRADED_THRESHOLD`     | 总队列 degraded 阈值           | 默认 `20`                            |
| `RUNTIME_QUEUE_DEPTH_SATURATED_THRESHOLD`    | 总队列 saturated 阈值          | 默认 `100`                           |
| `COMPILE_QUEUE_DEPTH_DEGRADED_THRESHOLD`     | 编译队列 degraded 阈值         | 默认 `10`                            |
| `COMPILE_QUEUE_DEPTH_SATURATED_THRESHOLD`    | 编译队列 saturated 阈值        | 默认 `50`                            |
| `PROVIDER_FAILURE_DEGRADED_THRESHOLD`        | provider 失败 degraded 阈值    | 默认 `3`                             |
| `EXPENSIVE_VALIDATION_ENABLED`               | 是否执行昂贵外部探测           | 默认 `false`                         |
| `PARSER_MAX_FILE_SIZE_MB`                    | parser 接受文件大小上限        | 默认 `50`                            |
| `PARSER_TIMEOUT_SECONDS`                     | parser 超时秒数                | 默认 `120`                           |
| `PARSER_CONCURRENCY`                         | 解析并发兼容回退               | 默认 `2`                             |
| `SOURCE_PARSE_CONCURRENCY`                   | 资料解析阶段并发               | 默认 `2`                             |
| `PARSER_ZIP_MAX_ENTRIES`                     | archive entry 数量上限         | 默认 `10000`                         |
| `PARSER_ZIP_MAX_EXPANDED_MB`                 | archive 解压后总大小上限 MB    | 默认 `1000`                          |
| `PARSER_ZIP_MAX_ENTRY_MB`                    | 单个 archive entry 大小上限 MB | 默认 `50`                            |
| `PARSER_MEDIA_UPLOAD_CONCURRENCY`            | 抽取媒体上传并发               | 默认 `2`                             |
| `PARSER_MAX_IMAGES_PER_DOCUMENT`             | 单文档视觉资产抽取上限         | 默认 `50`                            |
| `PARSER_MAX_RENDERED_SNAPSHOTS_PER_DOCUMENT` | 单文档渲染页/表快照上限        | 默认 `10`                            |
| `PARSER_MAX_IMAGE_PIXELS`                    | 单张抽取图片像素上限           | 默认 `16000000`                      |
| `PARSER_MAX_IMAGE_BYTES`                     | 单张抽取图片字节上限           | 默认 `10485760`                      |
| `PARSER_MIN_IMAGE_WIDTH`                     | 最小图片宽度                   | 默认 `64`                            |
| `PARSER_MIN_IMAGE_HEIGHT`                    | 最小图片高度                   | 默认 `64`                            |
| `PARSER_VISUAL_EXTRACTION_CONCURRENCY`       | 单文档视觉抽取并发             | 默认 `2`                             |
| `PARSER_REMOTE_IMAGE_FETCHING_ENABLED`       | Markdown/HTML 远程图片抓取     | 默认 `false`                         |
| `PARSER_PDF_SNAPSHOT_MIN_TEXT_CHARS`         | PDF 低文本页快照阈值           | 默认 `80`                            |

## 文档处理中间状态

| 字段                                           | 说明                            | 建议值       |
| ---------------------------------------------- | ------------------------------- | ------------ |
| `DOCUMENT_PROCESSING_MARKDOWN_WINDOW_CHARS`    | Markdown window artifact 字符数 | 默认 `64000` |
| `DOCUMENT_PROCESSING_DETAIL_DEFAULT_PAGE_SIZE` | processing detail 默认分页大小  | 默认 `50`    |
| `DOCUMENT_PROCESSING_DETAIL_MAX_PAGE_SIZE`     | processing detail 最大分页大小  | 默认 `200`   |
| `DOCUMENT_PROCESSING_CLEANUP_BATCH_SIZE`       | 过期中间状态清理批大小          | 默认 `500`   |
| `DOCUMENT_PROCESSING_SUCCESS_RETENTION_DAYS`   | 成功中间状态保留天数            | 默认 `7`     |
| `DOCUMENT_PROCESSING_FAILURE_RETENTION_DAYS`   | 失败中间状态保留天数            | 默认 `30`    |

## 队列、编译和 Retrieve

| 字段                                             | 说明                              | 建议值                                    |
| ------------------------------------------------ | --------------------------------- | ----------------------------------------- |
| `FOCOCONTEXT_QUEUE_CONCURRENCY`                  | 默认队列并发                      | 默认 `2`                                  |
| `BATCH_IMPORT_CONCURRENCY`                       | 批量导入并发                      | 默认 `2`                                  |
| `SOURCE_WATCH_SCAN_CONCURRENCY`                  | Source Watch 扫描并发             | 默认 `2`                                  |
| `BACKGROUND_REINDEX_BATCH_SIZE`                  | 重建索引批大小                    | 默认 `100`                                |
| `BACKGROUND_REINDEX_CURSOR_WINDOW_SIZE`          | 重建索引游标窗口                  | 默认 `100`                                |
| `BACKGROUND_REINDEX_CHECKPOINT_INTERVAL`         | 重建索引 checkpoint 间隔          | 默认 `1`                                  |
| `BACKGROUND_REINDEX_RETRY_BASE_DELAY_MS`         | 重建索引重试基础延迟              | 默认 `1000`                               |
| `BACKGROUND_REINDEX_CONCURRENCY`                 | 重建索引并发                      | 默认继承 `FOCOCONTEXT_QUEUE_CONCURRENCY`  |
| `BACKGROUND_GRAPH_INSIGHTS_BATCH_SIZE`           | 图谱洞察批大小                    | 默认 `100`                                |
| `BACKGROUND_GRAPH_INSIGHTS_CURSOR_WINDOW_SIZE`   | 图谱洞察游标窗口                  | 默认 `100`                                |
| `BACKGROUND_GRAPH_INSIGHTS_CHECKPOINT_INTERVAL`  | 图谱洞察 checkpoint 间隔          | 默认 `1`                                  |
| `BACKGROUND_GRAPH_INSIGHTS_RETRY_BASE_DELAY_MS`  | 图谱洞察重试基础延迟              | 默认 `1000`                               |
| `BACKGROUND_GRAPH_INSIGHTS_CONCURRENCY`          | 图谱洞察并发                      | 默认继承 `FOCOCONTEXT_QUEUE_CONCURRENCY`  |
| `BACKGROUND_KNOWLEDGE_CHECK_BATCH_SIZE`          | Knowledge Check 批大小            | 默认 `100`                                |
| `BACKGROUND_KNOWLEDGE_CHECK_CURSOR_WINDOW_SIZE`  | Knowledge Check 游标窗口          | 默认 `100`                                |
| `BACKGROUND_KNOWLEDGE_CHECK_CHECKPOINT_INTERVAL` | Knowledge Check checkpoint 间隔   | 默认 `1`                                  |
| `BACKGROUND_KNOWLEDGE_CHECK_RETRY_BASE_DELAY_MS` | Knowledge Check 重试基础延迟      | 默认 `1000`                               |
| `BACKGROUND_KNOWLEDGE_CHECK_CONCURRENCY`         | Knowledge Check 并发              | 默认继承 `FOCOCONTEXT_QUEUE_CONCURRENCY`  |
| `BACKGROUND_SOURCE_WATCH_BATCH_SIZE`             | Source Watch 后台批大小           | 默认 `100`                                |
| `BACKGROUND_SOURCE_WATCH_CURSOR_WINDOW_SIZE`     | Source Watch 后台游标窗口         | 默认 `100`                                |
| `BACKGROUND_SOURCE_WATCH_CHECKPOINT_INTERVAL`    | Source Watch 后台 checkpoint 间隔 | 默认 `1`                                  |
| `BACKGROUND_SOURCE_WATCH_RETRY_BASE_DELAY_MS`    | Source Watch 后台重试基础延迟     | 默认 `1000`                               |
| `BACKGROUND_SOURCE_WATCH_CONCURRENCY`            | Source Watch 后台并发             | 默认继承 `FOCOCONTEXT_QUEUE_CONCURRENCY`  |
| `BACKGROUND_OCR_BATCH_SIZE`                      | OCR 后台批大小                    | 默认 `100`                                |
| `BACKGROUND_OCR_CURSOR_WINDOW_SIZE`              | OCR 后台游标窗口                  | 默认 `100`                                |
| `BACKGROUND_OCR_CHECKPOINT_INTERVAL`             | OCR 后台 checkpoint 间隔          | 默认 `1`                                  |
| `BACKGROUND_OCR_RETRY_BASE_DELAY_MS`             | OCR 后台重试基础延迟              | 默认 `1000`                               |
| `BACKGROUND_OCR_CONCURRENCY`                     | OCR 后台并发                      | 默认继承 `FOCOCONTEXT_QUEUE_CONCURRENCY`  |
| `BACKGROUND_MEDIA_CAPTION_BATCH_SIZE`            | 媒体 caption 后台批大小           | 默认 `100`                                |
| `BACKGROUND_MEDIA_CAPTION_CURSOR_WINDOW_SIZE`    | 媒体 caption 后台游标窗口         | 默认 `100`                                |
| `BACKGROUND_MEDIA_CAPTION_CHECKPOINT_INTERVAL`   | 媒体 caption 后台 checkpoint 间隔 | 默认 `1`                                  |
| `BACKGROUND_MEDIA_CAPTION_RETRY_BASE_DELAY_MS`   | 媒体 caption 后台重试基础延迟     | 默认 `1000`                               |
| `BACKGROUND_MEDIA_CAPTION_CONCURRENCY`           | 媒体 caption 后台并发             | 默认继承 `FOCOCONTEXT_QUEUE_CONCURRENCY`  |
| `BACKGROUND_CLEANUP_BATCH_SIZE`                  | 清理批大小                        | 默认 `100`                                |
| `BACKGROUND_CLEANUP_CURSOR_WINDOW_SIZE`          | 清理游标窗口                      | 默认 `100`                                |
| `BACKGROUND_CLEANUP_CHECKPOINT_INTERVAL`         | 清理 checkpoint 间隔              | 默认 `1`                                  |
| `BACKGROUND_CLEANUP_RETRY_BASE_DELAY_MS`         | 清理重试基础延迟                  | 默认 `1000`                               |
| `BACKGROUND_CLEANUP_CONCURRENCY`                 | 清理并发                          | 默认继承 `FOCOCONTEXT_QUEUE_CONCURRENCY`  |
| `RESIDUAL_GRAPH_INSIGHTS_SUMMARY_WINDOW_SIZE`    | 图谱洞察残余 summary 窗口         | 默认 `100`                                |
| `RESIDUAL_GRAPH_INSIGHTS_CHECKPOINT_INTERVAL`    | 图谱洞察残余 checkpoint 间隔      | 默认 `1`                                  |
| `RESIDUAL_SOURCE_WATCH_COMPARISON_WINDOW_SIZE`   | Source Watch 残余对比窗口         | 默认 `100`                                |
| `RESIDUAL_SOURCE_WATCH_CHECKPOINT_INTERVAL`      | Source Watch 残余 checkpoint 间隔 | 默认 `1`                                  |
| `RESIDUAL_SOURCE_WATCH_SMALL_URL_LIST_LIMIT`     | Source Watch 小 URL 列表上限      | 默认继承 `SOURCE_WATCH_URL_LIST_MAX_URLS` |
| `RESIDUAL_OCR_PAGE_WINDOW_SIZE`                  | OCR 残余页窗口                    | 默认 `100`                                |
| `RESIDUAL_OCR_CHECKPOINT_INTERVAL`               | OCR 残余 checkpoint 间隔          | 默认 `1`                                  |
| `RESIDUAL_MEDIA_CAPTION_ASSET_WINDOW_SIZE`       | 媒体 caption 残余资产窗口         | 默认 `100`                                |
| `RESIDUAL_MEDIA_CAPTION_CHECKPOINT_INTERVAL`     | 媒体 caption 残余 checkpoint 间隔 | 默认 `1`                                  |
| `SOURCE_WATCH_SCHEDULER_ENABLED`                 | 是否启用定时扫描                  | 默认 `true`                               |
| `SOURCE_WATCH_SCAN_INTERVAL_SECONDS`             | 定时扫描间隔                      | 默认 `3600`                               |
| `SOURCE_WATCH_SCAN_MAX_RETRIES`                  | 扫描失败重试次数                  | 默认 `2`                                  |
| `SOURCE_WATCH_SCAN_RETRY_BASE_DELAY_MS`          | 扫描重试基础延迟                  | 默认 `1000`                               |
| `WIKI_ANALYZE_CONCURRENCY`                       | 分析阶段并发                      | 默认 `2`；受 Chat provider 限流影响       |
| `WIKI_GENERATE_CONCURRENCY`                      | 生成阶段并发                      | 默认 `2`                                  |
| `WIKI_MERGE_CONCURRENCY`                         | 合并阶段并发                      | 默认 `2`                                  |
| `COMPILE_MAX_CONTEXT_CHARS`                      | 编译 prompt 字符预算              | 默认 `24000`；大文档可按模型上下文调高    |
| `RETRIEVE_DEFAULT_TOP_K`                         | 默认候选数                        | 默认 `10`                                 |
| `RETRIEVE_MAX_TOP_K`                             | 最大候选数                        | 默认 `20`                                 |
| `RETRIEVE_DEFAULT_GRAPH_DEPTH`                   | 默认图谱深度                      | 默认 `1`                                  |
| `RETRIEVE_MAX_GRAPH_DEPTH`                       | 最大图谱深度                      | 默认 `3`                                  |
| `RETRIEVE_DEFAULT_GRAPH_LIMIT_PER_RESULT`        | 每结果默认图谱扩展数              | 默认 `5`                                  |
| `RETRIEVE_MAX_GRAPH_LIMIT_PER_RESULT`            | 每结果最大图谱扩展数              | 默认 `10`                                 |
| `RETRIEVE_DEFAULT_CONTEXT_BUDGET_TOKENS`         | 默认上下文预算                    | 默认 `4000`                               |
| `RETRIEVE_MAX_CONTEXT_BUDGET_TOKENS`             | 最大上下文预算                    | 默认 `12000`                              |
| `SOURCE_EVIDENCE_DEFAULT_MAX_CHARS`              | 默认资料证据文本上限              | 默认 `4000`                               |
| `SOURCE_EVIDENCE_MAX_CHARS`                      | 最大资料证据文本上限              | 默认 `12000`                              |
| `SOURCE_EVIDENCE_DEFAULT_CONTEXT_CHARS`          | 默认资料证据上下文                | 默认 `800`                                |
| `SOURCE_EVIDENCE_MAX_CONTEXT_CHARS`              | 最大资料证据上下文                | 默认 `2000`                               |
| `SOURCE_EVIDENCE_BATCH_MAX_ITEMS`                | 批量证据最大条数                  | 默认 `20`                                 |
| `SOURCE_EVIDENCE_BATCH_TOTAL_OUTPUT_MAX_CHARS`   | 批量证据总输出上限                | 默认 `40000`                              |

## Webhook

| 字段                                   | 说明                    | 建议值                              |
| -------------------------------------- | ----------------------- | ----------------------------------- |
| `FOCOCONTEXT_WEBHOOK_SECRET`           | 签名 secret             | 生产使用随机值；未用 Webhook 可留空 |
| `WEBHOOK_DELIVERY_ENABLED`             | `true` / `false`        | 需要事件投递时填 `true`             |
| `WEBHOOK_DELIVERY_TIMEOUT_SECONDS`     | 投递超时秒数            | 默认 `10`                           |
| `WEBHOOK_DELIVERY_CONCURRENCY`         | 投递并发                | 默认 `2`                            |
| `WEBHOOK_DELIVERY_MAX_RETRIES`         | 投递最大重试次数        | 默认 `3`                            |
| `WEBHOOK_DELIVERY_RETRY_BASE_DELAY_MS` | 投递重试基础延迟        | 默认 `1000`                         |
| `WEBHOOK_DELIVERY_RETRY_BACKOFF`       | `fixed` / `exponential` | 推荐 `exponential`                  |
| `WEBHOOK_SIGNING_TOLERANCE_SECONDS`    | 签名时间容忍窗口        | 默认 `300`                          |
| `WEBHOOK_DELIVERY_RETENTION_DAYS`      | 投递记录保留天数        | 默认 `30`                           |

## 生产填写建议

- 本地可以沿用端口默认值；生产用反向代理和内网服务地址。
- 管理员密码、API Key、数据库密码、S3 密钥、模型密钥、Webhook secret 都使用随机值。
- 系统对象存储 `S3_*` 和 Source Watch 资料源 S3 `SOURCE_WATCH_S3_*` 不要混用。
- 并发值从默认值开始，观察 CPU、内存、S3 带宽和模型限流后逐步调高。
- 可选能力先保持 `false`，完成基础入库和 Retrieve 验证后再开启。
