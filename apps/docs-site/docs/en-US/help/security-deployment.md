# Security Deployment

## Overview

FocoContext is designed for self-hosted deployments where the public edge, the API, the Admin Console, Workers, OCR, PostgreSQL, Redis, and object storage have clear boundaries. A production deployment should expose only the API and Admin domains, keep internal services private, and route operational diagnostics through authenticated endpoints.

| Surface                    | Production Exposure                                           |
| -------------------------- | ------------------------------------------------------------- |
| API                        | Public through HTTPS reverse proxy                            |
| Admin Console              | Public through HTTPS reverse proxy with Admin session cookies |
| Worker and OCR             | Internal Docker network only                                  |
| PostgreSQL and Redis       | Internal Docker network or private infrastructure only        |
| Object storage credentials | Server-side env only                                          |

## Production Compose Boundary

Use `docker-compose.example.yml` for image-based self-hosted deployment. Keep the default loopback bind host when a reverse proxy is on the same server:

```dotenv
FOCOCONTEXT_BIND_HOST=127.0.0.1
FOCOCONTEXT_API_PORT=18080
FOCOCONTEXT_ADMIN_PORT=18081
```

PostgreSQL, Redis, Worker, and OCR stay inside the Docker network in the image-based Compose templates. Do not use the dev Compose template for internet-facing deployments because it can publish database and Redis ports on the configured bind host.

## HTTPS and Cookie Settings

Terminate TLS at Nginx, Caddy, a managed load balancer, or a CDN edge. Configure the public URLs and trusted origins to match the deployed domains:

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

Enable HSTS only after HTTPS works reliably for the Admin and API domains. Keep the Admin API Key server-side. Browser sessions use Admin cookies and CSRF protection.

## Nginx Template

This template assumes API and Admin containers are bound to `127.0.0.1`. Adjust certificates, domains, body size, and timeouts for your deployment.

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

## Cloudflare Real IP

When Cloudflare proxies traffic, the origin server sees Cloudflare addresses by default. Cloudflare documents `CF-Connecting-IP` for the original visitor IP and recommends Nginx `ngx_http_realip_module` with trusted Cloudflare prefixes. Keep the prefix list synchronized with the official list at [https://www.cloudflare.com/ips/](https://www.cloudflare.com/ips/).

```nginx
# Repeat set_real_ip_from for every current Cloudflare prefix.
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 2400:cb00::/32;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

Only enable real IP trust for a known proxy or CDN path. Direct origin exposure lets clients spoof forwarding headers.

## Authenticated Diagnostics

`/health` is the public readiness endpoint. It should stay minimal. Release metadata, queue state, provider readiness, upload runtime details, and migration status belong behind authenticated diagnostics:

- `/v1/runtime/status`
- `/openapi.json`
- machine-readable contract routes

Access those routes with an Admin session or a Bearer API Key with the required permission. Do not publish diagnostic output in screenshots or public support threads without redaction.

## Upload and Remote Source Controls

Uploaded files and remote sources are treated as untrusted until parsing, limits, and optional scanner hooks pass. Keep parser and upload limits aligned with the reverse proxy:

```dotenv
UPLOAD_MAX_FILE_SIZE_MB=50
PARSER_MAX_FILE_SIZE_MB=50
PARSER_TIMEOUT_SECONDS=120
PARSER_ZIP_MAX_ENTRIES=10000
PARSER_ZIP_MAX_EXPANDED_MB=1000
PARSER_REMOTE_IMAGE_FETCHING_ENABLED=false
```

Remote Source Watch blocks private networks and metadata services by default:

```dotenv
SOURCE_WATCH_PRIVATE_NETWORK_ENABLED=false
SOURCE_WATCH_PRIVATE_NETWORK_ALLOWLIST=
```

Enable private-network Source Watch only for trusted intranet ingestion and only with an explicit host, IP, or CIDR allowlist.

## Deployment Security Checklist

Before opening a deployment to external traffic:

1. Confirm only the intended API and Admin domains are reachable from the public internet.
2. Confirm stack traces, raw provider responses, raw prompts, object keys, signed URLs, and secrets are redacted from responses and logs.
3. Confirm Admin browser storage does not contain Bearer API Keys or provider credentials.
4. Confirm PostgreSQL, Redis, Worker, OCR, and object storage remain on private networks or trusted provider boundaries.
5. Confirm Source Watch private-network access is disabled unless an explicit allowlist is configured.
6. Rotate any credential that was copied into a shell history, screenshot, support ticket, or shared document.

## Incident Response

Use [SECURITY.md](https://github.com/farozerolabs/fococontext/blob/main/SECURITY.md) for vulnerability reports through GitHub Private Vulnerability Reporting. For operational incidents:

- API key leak: rotate `FOCOCONTEXT_API_KEY`, restart API/Worker, review security audit events, and invalidate affected integrations.
- Admin session compromise: rotate the Admin password, restart services to invalidate volatile sessions when needed, and review login audit events.
- Upload abuse: lower upload limits, disable direct upload if needed, review failed parser and scanner records, and remove suspicious source artifacts.
- SSRF attempt: keep `SOURCE_WATCH_PRIVATE_NETWORK_ENABLED=false`, inspect unsafe source rejection audit events, and verify proxy egress rules.
- Object-storage exposure: rotate S3 credentials, remove public bucket policies, review presigned URL TTLs, and audit exported packages.
- Dependency vulnerability: patch, rebuild images, and document any temporary mitigations for operators.
