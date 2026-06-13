# 安全部署

## 引言

FocoContext 面向自托管部署，公网边界、API、管理后台、Worker、OCR、PostgreSQL、Redis 和对象存储需要有清晰边界。生产部署只暴露 API 和管理后台域名，内部服务保持私有，运行诊断通过鉴权接口访问。

| 接口面              | 生产暴露方式                                       |
| ------------------- | -------------------------------------------------- |
| API                 | 通过 HTTPS 反向代理公开                            |
| 管理后台            | 通过 HTTPS 反向代理公开，使用 Admin Session Cookie |
| Worker 和 OCR       | 仅 Docker 内部网络                                 |
| PostgreSQL 和 Redis | 仅 Docker 内部网络或私有基础设施                   |
| 对象存储凭证        | 仅服务端 env 保存                                  |

## 生产 Compose 边界

基于镜像的自托管部署使用 `docker-compose.example.yml`。反向代理与容器在同一台服务器时，保持默认本机监听：

```dotenv
FOCOCONTEXT_BIND_HOST=127.0.0.1
FOCOCONTEXT_API_PORT=18080
FOCOCONTEXT_ADMIN_PORT=18081
```

基于镜像的 Compose 模板中，PostgreSQL、Redis、Worker 和 OCR 保持在 Docker 内部网络。不要把 dev Compose 模板用于公网部署，因为它可能按配置的监听地址发布数据库和 Redis 端口。

## HTTPS 和 Cookie 配置

TLS 可以在 Nginx、Caddy、托管负载均衡或 CDN 边缘终止。生产域名和可信来源需要写入 `.env`：

```dotenv
FOCOCONTEXT_CORS_ORIGINS=https://foco.example.com
FOCOCONTEXT_ADMIN_API_BASE_URL=https://api.example.com/v1
FOCOCONTEXT_ADMIN_BASE_URL=https://foco.example.com
FOCOCONTEXT_ADMIN_COOKIE_SECURE=true
FOCOCONTEXT_ADMIN_COOKIE_SAMESITE=lax
SECURITY_HEADERS_ENABLED=true
SECURITY_HSTS_ENABLED=true
SECURITY_HSTS_MAX_AGE_SECONDS=15552000
```

Admin 和 API 域名的 HTTPS 稳定后再开启 HSTS。OpenAPI Key 只保存在服务端。浏览器访问管理后台使用 Admin Cookie 和 CSRF 防护。

## Nginx 模板

这个模板假设 API 和 Admin 容器监听 `127.0.0.1`。证书、域名、请求体大小和超时应按生产环境调整。

```nginx
server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

  client_max_body_size 256m;
  proxy_connect_timeout 30s;
  proxy_send_timeout 300s;
  proxy_read_timeout 300s;

  location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}

server {
  listen 443 ssl http2;
  server_name foco.example.com;

  ssl_certificate /etc/letsencrypt/live/foco.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/foco.example.com/privkey.pem;

  client_max_body_size 256m;
  proxy_connect_timeout 30s;
  proxy_send_timeout 300s;
  proxy_read_timeout 300s;

  location / {
    proxy_pass http://127.0.0.1:18081;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

## Cloudflare 真实 IP

Cloudflare 代理流量时，源站默认看到的是 Cloudflare 地址。Cloudflare 官方文档说明，原始访问者 IP 会写入 `CF-Connecting-IP`，Nginx 可通过 `ngx_http_realip_module` 和可信 Cloudflare 前缀还原真实 IP。Cloudflare 前缀需要按官方列表维护：[https://www.cloudflare.com/ips/](https://www.cloudflare.com/ips/)。

```nginx
# 每个当前 Cloudflare 前缀都需要配置 set_real_ip_from。
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 2400:cb00::/32;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

只在确定请求来自可信反向代理或 CDN 时启用真实 IP 信任。源站直接暴露时，客户端可以伪造转发头。

## 鉴权诊断接口

`/health` 是公开 readiness 接口，应保持最小输出。发布元数据、队列状态、provider 可用性、上传运行时细节和迁移状态属于鉴权诊断：

- `/v1/runtime/status`
- `/openapi.json`
- machine-readable contract routes

这些接口需要 Admin Session 或具备权限的 Bearer API Key。截图、日志和公开支持材料中不要包含未脱敏诊断信息。

## 上传与远程源控制

上传文件和远程源在解析、限制检查和可选扫描钩子通过前，都按不可信内容处理。反向代理、上传和 parser 的限制需要保持一致：

```dotenv
UPLOAD_MAX_FILE_SIZE_MB=50
PARSER_MAX_FILE_SIZE_MB=50
PARSER_TIMEOUT_SECONDS=120
PARSER_ZIP_MAX_ENTRIES=10000
PARSER_ZIP_MAX_EXPANDED_MB=1000
PARSER_REMOTE_IMAGE_FETCHING_ENABLED=false
```

Remote Source Watch 默认阻断私网和 metadata 服务：

```dotenv
SOURCE_WATCH_PRIVATE_NETWORK_ENABLED=false
SOURCE_WATCH_PRIVATE_NETWORK_ALLOWLIST=
```

只有可信内网资料源才开启 private-network Source Watch，并且必须写入明确的 host、IP 或 CIDR allowlist。

## 部署安全检查

开放外部流量前，建议逐项确认：

1. 只有计划开放的 API 和管理后台域名可以从公网访问。
2. 响应和日志中不暴露 stack traces、原始 provider 响应、原始 prompts、object keys、signed URLs 和 secrets。
3. 管理后台浏览器存储中不包含 Bearer API Key 或 provider 凭证。
4. PostgreSQL、Redis、Worker、OCR 和对象存储保持在私有网络或可信 provider 边界内。
5. Source Watch private-network access 默认关闭，只有配置明确 allowlist 后才启用。
6. 如果凭证进入 shell history、截图、支持工单或共享文档，立即轮换。

## 事故响应

漏洞报告入口见 [SECURITY.md](https://github.com/farozerolabs/fococontext/blob/main/SECURITY.md)，使用 GitHub Private Vulnerability Reporting。运维事故可以按以下路径处理：

- API Key 泄露：轮换 `FOCOCONTEXT_API_KEY`，重启 API/Worker，检查安全审计事件，并更新受影响的集成。
- Admin Session 风险：轮换 Admin 密码，必要时重启服务使短期会话失效，检查登录审计事件。
- 上传滥用：降低上传限制，必要时关闭 direct upload，检查 parser 和 scanner 失败记录，移除可疑 source artifacts。
- SSRF 尝试：保持 `SOURCE_WATCH_PRIVATE_NETWORK_ENABLED=false`，检查 unsafe source rejection 审计事件，并确认代理出口规则。
- 对象存储暴露：轮换 S3 凭证，移除公开 bucket policy，检查 presigned URL TTL 和导出包。
- 依赖漏洞：升级依赖，重建镜像，并向运维者记录临时缓解措施。
