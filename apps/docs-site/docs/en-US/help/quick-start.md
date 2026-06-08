# Docker Compose Quick Start

## Overview

Use this page to start the service for the first time. After it works, continue with Knowledge Base workflow and Sources and Ingest, then validate the full chain with a small file.

## Prerequisites

| Item                  | Requirement                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| Docker                | Docker Compose support                                                             |
| PostgreSQL / Redis    | Started by Compose by default                                                      |
| S3-compatible storage | Use real S3-compatible storage for production; configure through `.env`            |
| Model providers       | Configure OpenAI-compatible Chat, Embedding, Rerank, and optional Vision providers |
| Node.js / pnpm        | Required only when building from source or running developer scripts               |

## Step 1: Prepare `.env`

Copy the template:

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

At minimum, configure:

| Category       | Important values                                            |
| -------------- | ----------------------------------------------------------- |
| Admin          | Admin username and password                                 |
| OpenAPI        | Bearer API Key                                              |
| Database       | PostgreSQL URL                                              |
| Queue          | Redis URL                                                   |
| Object storage | S3 endpoint, bucket, region, access key, secret key         |
| Models         | Chat, Embedding, Rerank base URL, API key, model            |
| Runtime        | Worker concurrency, upload limits, OCR, image caption flags |

Do not commit admin passwords or API Keys. Settings shows masked status only.

## Step 2: Start the Service

For released self-hosted deployments, set an exact image tag such as
`FOCOCONTEXT_IMAGE_TAG=0.1.0` in `.env`, then run:

```bash
docker compose up -d
```

The default Compose template pulls published API, Admin, Worker, and OCR images
from GitHub Container Registry under `ghcr.io/farozerolabs`.
`FOCOCONTEXT_IMAGE_TAG` is required by the release template and should match the
product image tag derived from a Git release tag, for example `v0.1.0` ->
`0.1.0`. For local source-build development, use
`docker-compose.dev.example.yml` through `pnpm install` and `pnpm run docker:up`.

The release templates have two startup paths:

| Template                                  | Command                                                                                          | OCR behavior                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `docker-compose.example.yml`              | `docker compose up -d`                                                                           | Starts OCR with the default stack   |
| `docker-compose.optional-ocr.example.yml` | `OCR_ENABLED=false docker compose -f docker-compose.optional-ocr.example.yml up -d`              | Starts without OCR                  |
| `docker-compose.optional-ocr.example.yml` | `OCR_ENABLED=true docker compose -f docker-compose.optional-ocr.example.yml --profile ocr up -d` | Starts OCR explicitly when required |

For the first public release, maintainers should confirm the GHCR packages are
public before publishing install instructions that reference those images.

Published service ports bind to localhost by default. Keep
`FOCOCONTEXT_BIND_HOST=127.0.0.1` for reverse-proxy deployments. Set
`FOCOCONTEXT_BIND_HOST=0.0.0.0` only when direct network exposure is intentional.
Keep `FOCOCONTEXT_API_PORT`, `FOCOCONTEXT_ADMIN_PORT`,
`FOCOCONTEXT_POSTGRES_PORT`, and `FOCOCONTEXT_REDIS_PORT` as numeric values. Do
not place host-prefixed values such as `127.0.0.1:18080` in those fields.

For a two-domain Nginx reverse proxy, set the public URLs in `.env`:

```env
FOCOCONTEXT_CORS_ORIGINS=https://foco.example.com
FOCOCONTEXT_ADMIN_API_BASE_URL=https://api.example.com/v1
FOCOCONTEXT_ADMIN_BASE_URL=https://foco.example.com
```

Use this as a starting Nginx template:

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

After startup, open:

| Service      | URL                                   |
| ------------ | ------------------------------------- |
| Admin Web    | `http://127.0.0.1:18081`              |
| API Base URL | `http://127.0.0.1:18080/v1`           |
| OpenAPI JSON | `http://127.0.0.1:18080/openapi.json` |
| PostgreSQL   | `127.0.0.1:18432`                     |
| Redis        | `127.0.0.1:18379`                     |

OpenAPI JSON is protected. Read it from an authenticated Admin Console session, or send `Authorization: Bearer <FOCOCONTEXT_API_KEY>` from a server process.

## Step 3: Sign in to Admin

Open Admin Web and sign in with the admin account from `.env`. Go to Settings first and check:

- API Server health.
- Worker health.
- PostgreSQL and Redis availability.
- S3-compatible storage configuration.
- Chat, Embedding, Rerank, and Vision provider status.

## Step 4: Create a Test Knowledge Base

From Dashboard, create a Knowledge Base. Start with simple values:

| Field           | Suggested value                                            |
| --------------- | ---------------------------------------------------------- |
| Name            | `Demo Knowledge Base`                                      |
| slug            | `demo-kb`                                                  |
| Output language | Your test language                                         |
| purpose         | State that this verifies ingest, Wiki, graph, and Retrieve |
| schema          | Keep defaults                                              |

Copy the Knowledge Base ID after creation. API calls use it.

## Step 5: Upload a Small File

Open Sources and upload a small Markdown, PDF, or DOCX file. Do not start with large files. Confirm that:

1. The source appears in the list.
2. Status moves through queued, parsing, analyzing, generating, merging, indexing, and completed.
3. Job detail shows newest events first.
4. Wiki Pages and Graph View contain data after completion.

## Step 6: Validate Retrieve

Open Retrieval Lab and ask a question related to the file. Inspect:

- Matched Wiki Pages.
- Source citations and locators.
- Graph expansion results.
- Whether `context_pack` is usable by your upstream model.

## Common Startup Issues

| Symptom                    | Check                                                         |
| -------------------------- | ------------------------------------------------------------- |
| Admin is unreachable       | Admin container health and port `18081`                       |
| Sign-in fails              | Admin username/password in `.env` and current container       |
| Upload fails               | S3 config, bucket permission, API body limit                  |
| Job stays queued           | Worker health and Redis connectivity                          |
| Analysis fails             | Chat provider base URL, API key, model name, streaming config |
| Retrieve returns no result | Embedding provider, index status, completed job state         |

## Production Notes

- Validate the full chain with a small file before importing production data.
- Do not share the same S3 bucket between production and throwaway tests.
- Tune Worker concurrency after observing CPU, memory, provider rate limits, and S3 bandwidth.
- On a server, expose the frontend domain through your proxy and control API access intentionally.
