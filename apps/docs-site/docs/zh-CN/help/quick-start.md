# Docker Compose 快速开始

## 引言

本页用于第一次把服务跑起来。完成后继续阅读“知识库流程”和“资料入库”，用一个小文件验证完整链路。

## 前置条件

| 项目               | 要求                                                            |
| ------------------ | --------------------------------------------------------------- |
| Docker             | 支持 Docker Compose                                             |
| PostgreSQL / Redis | 默认由 Compose 启动                                             |
| S3-compatible 存储 | 生产建议使用真实 S3-compatible 服务，本地可按 `.env` 配置       |
| 模型供应商         | Chat、Embedding、Rerank、Vision 按需配置 OpenAI-compatible 接口 |
| Node.js / pnpm     | 只有从源码构建或运行开发脚本时需要                              |

## 步骤 1：准备 `.env`

复制模板：

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

至少填写：

| 配置类别 | 关键项                                              |
| -------- | --------------------------------------------------- |
| 管理后台 | 管理员用户名、管理员密码                            |
| OpenAPI  | Bearer API Key                                      |
| 数据库   | PostgreSQL URL                                      |
| 队列     | Redis URL                                           |
| 对象存储 | S3 endpoint、bucket、region、access key、secret key |
| 模型     | Chat、Embedding、Rerank base URL、API key、model    |
| 运行时   | Worker 并发、上传限制、OCR、图片 caption 开关       |

管理员密码和 API Key 都不应提交到 Git。后台设置页只展示脱敏状态。

## 步骤 2：启动服务

发布式自托管部署时，在 `.env` 中固定明确镜像版本，例如
`FOCOCONTEXT_IMAGE_TAG=0.1.0`，然后执行：

```bash
docker compose up -d
```

默认 Compose 模板会从 GitHub Container Registry 的 `ghcr.io/farozerolabs` 拉取已发布的 API、Admin、Worker 和 OCR 镜像。本地源码构建开发时，通过 `docker-compose.dev.example.yml` 执行 `pnpm install` 和 `pnpm run docker:up`。

发布模板要求显式设置 `FOCOCONTEXT_IMAGE_TAG`。这个值应来自 Git release tag 对应的产品镜像 tag，例如 `v0.1.0` -> `0.1.0`。

发布模板有两种启动路径：

| 模板                                      | 命令                                                                                             | OCR 行为             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------- |
| `docker-compose.example.yml`              | `docker compose up -d`                                                                           | 默认随服务栈一起启动 |
| `docker-compose.optional-ocr.example.yml` | `OCR_ENABLED=false docker compose -f docker-compose.optional-ocr.example.yml up -d`              | 默认不启动 OCR       |
| `docker-compose.optional-ocr.example.yml` | `OCR_ENABLED=true docker compose -f docker-compose.optional-ocr.example.yml --profile ocr up -d` | 需要时显式启动 OCR   |

首个公开版本发布后，维护者需要先确认 GHCR packages 已经公开，再发布引用这些镜像的安装说明。

发布端口默认通过 `FOCOCONTEXT_BIND_HOST=127.0.0.1` 只监听本机，适合反向代理部署。只有明确需要直接开放服务端口时，才设置 `FOCOCONTEXT_BIND_HOST=0.0.0.0`。`FOCOCONTEXT_API_PORT`、`FOCOCONTEXT_ADMIN_PORT`、`FOCOCONTEXT_POSTGRES_PORT` 和 `FOCOCONTEXT_REDIS_PORT` 继续只填写数字端口。不要把 `127.0.0.1:18080` 这类带 host 的值填进这些字段。

双域名 Nginx 反向代理时，在 `.env` 中写入公网访问地址：

```env
FOCOCONTEXT_CORS_ORIGINS=https://foco.example.com
FOCOCONTEXT_ADMIN_API_BASE_URL=https://api.example.com/v1
FOCOCONTEXT_ADMIN_BASE_URL=https://foco.example.com
```

Nginx 模板可以从这里开始调整：

```nginx
server {
  listen 443 ssl http2;
  server_name foco.example.com;

  client_max_body_size 256m;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  location / {
    proxy_pass http://127.0.0.1:18081;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 443 ssl http2;
  server_name api.example.com;

  client_max_body_size 256m;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

启动完成后访问：

| 服务         | 地址                                  |
| ------------ | ------------------------------------- |
| Admin Web    | `http://127.0.0.1:18081`              |
| API Base URL | `http://127.0.0.1:18080/v1`           |
| OpenAPI JSON | `http://127.0.0.1:18080/openapi.json` |
| PostgreSQL   | `127.0.0.1:18432`                     |
| Redis        | `127.0.0.1:18379`                     |

OpenAPI JSON 需要鉴权。可以在已登录的管理后台会话中读取，或由服务端进程发送 `Authorization: Bearer <FOCOCONTEXT_API_KEY>` 读取。

## 步骤 3：登录后台

打开 Admin Web，使用 `.env` 中的管理员账号登录。登录后先进入设置页，检查：

- API Server 是否健康。
- Worker 是否健康。
- PostgreSQL 和 Redis 是否可用。
- S3-compatible 存储是否配置完整。
- Chat、Embedding、Rerank、Vision provider 是否显示可用或已配置。

## 步骤 4：创建测试知识库

在主页点击新建知识库。建议第一次使用简单配置：

| 字段     | 建议值                                    |
| -------- | ----------------------------------------- |
| 名称     | `Demo Knowledge Base`                     |
| slug     | `demo-kb`                                 |
| 输出语言 | 选择你的测试语言                          |
| purpose  | 描述“用于验证入库、Wiki、图谱和 Retrieve” |
| schema   | 使用默认值                                |

保存后复制 Knowledge Base ID，后续 API 调用会用到。

## 步骤 5：上传小文件

进入资料页上传一个小型 Markdown、PDF 或 DOCX。第一次验证不要直接上传大文件。上传后确认：

1. 资料列表出现新记录。
2. 状态从排队、解析、分析、生成、合并、索引逐步变化。
3. 任务详情里最新事件排在上方。
4. 完成后 Wiki 页面和 Graph View 有数据。

## 步骤 6：验证 Retrieve

进入检索调试页，输入和测试文件相关的问题。检查返回：

- 命中的 Wiki 页面。
- 引用来源和 source locator。
- 图谱扩展结果。
- `context_pack` 是否包含可交给上层模型的上下文。

## 常见启动问题

| 现象         | 检查项                                               |
| ------------ | ---------------------------------------------------- |
| 后台打不开   | Admin 容器是否 healthy，端口 `18081` 是否被占用      |
| 登录失败     | `.env` 管理员账号密码是否和当前容器一致              |
| 上传失败     | S3 配置、bucket 权限、API 请求体大小限制             |
| 任务一直排队 | Worker 是否 healthy，Redis 是否可达                  |
| 任务分析失败 | Chat provider base URL、API key、模型名和流式配置    |
| 检索无结果   | Embedding provider、索引状态、任务是否真正 completed |

## 生产建议

- 先用小文件验证全链路，再导入生产资料。
- 生产 S3 bucket 不要和测试 bucket 混用。
- 调整 Worker 并发前先观察 CPU、内存、模型限流和 S3 带宽。
- 服务器部署时可以只对外暴露前端域名，API 可由反向代理控制访问。
