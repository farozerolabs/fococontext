<p align="center">
  <img src="apps/docs-site/docs/public/og/og.png" width="100%" alt="FocoContext - Enterprise Knowledge Base System Based on the LLM Wiki Concept" />
</p>

<h1 align="center">FocoContext</h1>

<p align="center">
  <strong>Self-hostable Wiki-first knowledge infrastructure for developer products.</strong>
  <br />
  Compile documents into living Wiki Pages, graph relationships, source evidence,
  versions, and retrieval context that Agents can trust.
</p>

<p align="center">
  <a href="https://docs.fococontext.com">Documentation</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="https://docs.fococontext.com/en-US/openapi/integration-flow">API Guide</a> ·
  <a href="https://docs.fococontext.com/en-US/help/introduction">Architecture</a> ·
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Docker_Compose-2496ed?style=flat-square" alt="Docker Compose runtime" />
  <img src="https://img.shields.io/badge/API-OpenAPI_3.1-6f42c1?style=flat-square" alt="OpenAPI 3.1" />
  <img src="https://img.shields.io/badge/models-OpenAI_compatible-10a37f?style=flat-square" alt="OpenAI-compatible providers" />
  <img src="https://img.shields.io/badge/license-Modified_Apache_2.0-blue?style=flat-square" alt="Modified Apache 2.0 license" />
</p>

---

FocoContext gives developer teams a knowledge layer that grows stronger every
time new source material arrives. Upload documents, let the system compile them
into durable Wiki Pages, and retrieve context through an API designed for
Agents, backends, and internal tools.

Raw sources remain traceable. Wiki Pages become the maintained knowledge
surface. Graph relationships explain how ideas connect. Versions preserve how
the knowledge base changes over time.

FocoContext follows [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):
LLMs maintain a persistent wiki from your sources, so knowledge compounds as a
living artifact. FocoContext turns that pattern into an API-first,
self-hostable service.

<p align="center">
  <img src="apps/docs-site/docs/public/images/fococontext-product-architecture.png" width="100%" alt="FocoContext product architecture" />
</p>

## Why FocoContext

### Knowledge Should Compound

Documents arrive as PDFs, Office files, Markdown, spreadsheets, exported pages,
logs, and web captures. FocoContext parses them, extracts usable Markdown,
keeps source locators, and compiles the material into Wiki Pages that stay
available for every future query.

### Agents Need a Knowledge Surface

Agents work better when they receive organized context with page identity,
citations, graph neighbors, answerability signals, and bounded source evidence.
FocoContext serves that context through OpenAPI and a TypeScript SDK.

### Teams Need Control

Every ingest creates jobs, artifacts, Change Sets, versions, and traces.
Operators can inspect failures, retry work, rebuild indexes, review graph
structure, and resolve source evidence without losing the audit trail.

## Key Features

**1. Wiki-first ingest**  
Source documents compile into Wiki Pages, source summaries, system pages,
relationships, and versions. The long-lived knowledge surface is the Wiki.

**2. Source-traceable retrieval**  
Retrieve returns page-centered results, citations, source locators, context
packs, answerability metadata, and optional traces. Applications can resolve
citations back to bounded source evidence through OpenAPI.

**3. Graph-enhanced context**  
FocoContext builds relationships from Wiki links, shared sources, common
neighbors, and type affinity. Retrieve can expand from a seed result into
nearby context with a clear relationship path.

**4. Git-like knowledge versions**  
Knowledge Bases maintain versions, Page Versions, Change Sets, diffs, rollback
records, and Knowledge Check findings. Updates become reviewable history.

**5. Fork-owned submissions**  
Developer applications can write user-owned or workspace-owned generated
content into isolated forks. Canonical knowledge stays clean while fork
retrieval sees the private overlay.

**6. API-first operations**  
The Admin Console and external applications call the same REST API. Knowledge
Bases, documents, jobs, pages, graph, retrieval, source evidence, webhooks, and
forks all have OpenAPI contracts.

**7. Self-hostable runtime**  
The stack runs with Docker Compose: API Server, Worker, Admin Console,
PostgreSQL + pgvector, Redis + BullMQ, S3-compatible object storage, and an
optional RapidOCR sidecar.

**8. Model-agnostic providers**  
Chat, embedding, rerank, vision caption, OCR, storage, and runtime limits are
configured through env. OpenAI-compatible endpoints are first-class.

## Quick Start

### Requirements

- Docker and Docker Compose
- An OpenAI-compatible chat model endpoint
- An OpenAI-compatible embedding endpoint
- An external or managed S3-compatible object storage endpoint
- Node.js 22+ and pnpm 10+ only for source development and local scripts

### 1. Prepare Local Files

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

Edit `.env` before starting the stack. At minimum, set:

```bash
# Required by docker-compose.example.yml. Use the exact Docker image tag from
# the Git release tag, for example v0.1.0 -> 0.1.0.
FOCOCONTEXT_IMAGE_TAG=0.1.0

# Public GHCR image namespace. Override only when using a custom registry.
FOCOCONTEXT_IMAGE_NAMESPACE=ghcr.io/farozerolabs

# Published ports bind to localhost by default for reverse-proxy deployments.
# Use 0.0.0.0 only when direct network exposure is intentional.
FOCOCONTEXT_BIND_HOST=127.0.0.1

FOCOCONTEXT_ADMIN_PASSWORD=...
FOCOCONTEXT_API_KEY=...
POSTGRES_PASSWORD=...
DATABASE_URL=postgresql://fococontext:<same-postgres-password>@postgres:5432/fococontext

S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...

CHAT_PROVIDER_NAME=...
CHAT_BASE_URL=...
CHAT_API_KEY=...
CHAT_DEFAULT_MODEL=...
CHAT_ANALYSIS_MODEL=...
CHAT_GENERATION_MODEL=...
CHAT_MERGE_MODEL=...

EMBEDDING_PROVIDER_NAME=...
EMBEDDING_BASE_URL=...
EMBEDDING_API_KEY=...
EMBEDDING_MODEL=...
EMBEDDING_DIMENSIONS=1536
```

### 2. Start FocoContext

```bash
docker compose up -d
```

`docker-compose.example.yml` pulls published API, Worker, Admin, and OCR images
from GitHub Container Registry under `ghcr.io/farozerolabs`.
`FOCOCONTEXT_IMAGE_TAG` is required and should point to an exact released image
tag such as `0.1.0`.

Published service ports bind to `127.0.0.1` by default through
`FOCOCONTEXT_BIND_HOST`. This works well when Nginx, Caddy, Traefik, or another
host reverse proxy terminates public traffic and proxies to local ports. Set
`FOCOCONTEXT_BIND_HOST=0.0.0.0` only when direct network access is intentional.
Keep `FOCOCONTEXT_API_PORT`, `FOCOCONTEXT_ADMIN_PORT`,
`FOCOCONTEXT_POSTGRES_PORT`, and `FOCOCONTEXT_REDIS_PORT` as numeric values such
as `18080`; do not put host-prefixed values such as `127.0.0.1:18080` in those
port fields.

### 3. Open the Console

| Service       | URL                                   |
| ------------- | ------------------------------------- |
| Admin Console | `http://localhost:18081`              |
| API health    | `http://localhost:18080/health`       |
| OpenAPI JSON  | `http://localhost:18080/openapi.json` |

Admin login uses:

```bash
FOCOCONTEXT_ADMIN_USERNAME
FOCOCONTEXT_ADMIN_PASSWORD
```

Developer API calls use:

```http
Authorization: Bearer <FOCOCONTEXT_API_KEY>
```

`GET /openapi.json` is a protected machine-readable contract. Use an
authenticated Admin Console session or send
`Authorization: Bearer <FOCOCONTEXT_API_KEY>`. Anonymous requests are rejected.

## Using FocoContext

### Self-host With Docker Compose

Use the image-based Compose template for self-hosted deployments. The template
expects external S3-compatible storage and env-configured model providers.

```bash
docker compose up -d
```

The default template starts the full stack: API, Worker, Admin, PostgreSQL,
Redis, and the bundled OCR service.

Use the optional-OCR template on constrained hosts:

```bash
OCR_ENABLED=false docker compose -f docker-compose.optional-ocr.example.yml up -d
```

Start OCR with that optional template when scanned or low-text PDFs need OCR:

```bash
OCR_ENABLED=true docker compose -f docker-compose.optional-ocr.example.yml --profile ocr up -d
```

For a two-domain reverse proxy, keep published ports bound to localhost and set
the public URLs in `.env`:

```env
FOCOCONTEXT_BIND_HOST=127.0.0.1
FOCOCONTEXT_CORS_ORIGINS=https://foco.example.com
FOCOCONTEXT_ADMIN_API_BASE_URL=https://api.example.com/v1
FOCOCONTEXT_ADMIN_BASE_URL=https://foco.example.com
```

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

### Build From Source

```bash
pnpm install
pnpm run docker:up
```

The dev command uses `docker-compose.dev.example.yml`, builds local images,
starts the stack in the background, removes orphan containers, and prunes stale
Docker resources labeled for the current Compose project. Active PostgreSQL and
Redis volumes are kept.

The dev stack also starts OCR by default:

```bash
pnpm run docker:up:ocr
```

Common development checks:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run verify
```

Run the documentation site:

```bash
pnpm run docs:dev
```

### Integrate by API

Run the OpenAPI quickstart example:

```bash
export FOCOCONTEXT_BASE_URL=http://localhost:18080
export FOCOCONTEXT_API_KEY=<your-api-key>
export FOCOCONTEXT_DOCUMENT_PATH=/absolute/path/to/document.pdf

sh examples/quickstart.curl.sh
```

The script creates a Knowledge Base, uploads a document, polls the ingest job,
runs Retrieve, and runs Retrieve Expand when graph context is available.

Minimal API flow:

```bash
api_base="http://localhost:18080/v1"

curl "$api_base/knowledge-bases" \
  -H "Authorization: Bearer $FOCOCONTEXT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Engineering Knowledge","template":"team_knowledge","output_language":"en-US"}'
```

### Use the JavaScript SDK

The workspace includes `@fococontext/sdk-js` for typed API calls:

```ts
import { createFococontextClient } from "@fococontext/sdk-js";

const client = createFococontextClient({
  apiKey: process.env.FOCOCONTEXT_API_KEY!,
  baseUrl: "http://localhost:18080/v1",
});

const knowledgeBase = await client.createKnowledgeBase({
  name: "Engineering Knowledge",
  template: "team_knowledge",
  output_language: "en-US",
});

const retrieval = await client.retrieveKnowledgeContext(knowledgeBase.id, {
  query: "What changed in the onboarding flow?",
  mode: "hybrid",
  top_k: 5,
  graph_depth: 1,
  graph_limit_per_result: 5,
  include_graph: true,
  include_context_pack: true,
  include_trace: true,
  context_budget_tokens: 4000,
});

if (retrieval.answerability.no_answer) {
  console.log("No source-backed answer is available.", {
    action: retrieval.answerability.recommended_action,
    reasonCodes: retrieval.answerability.reason_codes,
  });
}
```

See `examples/sdk-ready-quickstart.ts` for a complete script.

## Core API Surface

| Endpoint                                                                                              | Purpose                                      |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /v1/knowledge-bases`                                                                            | Create a Knowledge Base                      |
| `POST /v1/knowledge-bases/{knowledge_base_id}/documents`                                              | Upload a source document                     |
| `POST /v1/knowledge-bases/{knowledge_base_id}/documents/upload-sessions`                              | Create a direct upload session               |
| `POST /v1/knowledge-bases/{knowledge_base_id}/documents/upload-sessions/{upload_session_id}/finalize` | Finalize a direct upload                     |
| `GET /v1/jobs/{job_id}`                                                                               | Poll ingest and compile progress             |
| `POST /v1/jobs/batch`                                                                                 | Resolve multiple ingest job statuses         |
| `GET /v1/knowledge-bases/{knowledge_base_id}/ingest-progress`                                         | Read aggregate ingest and Retrieve readiness |
| `GET /v1/knowledge-bases/{knowledge_base_id}/pages`                                                   | List generated Wiki Pages                    |
| `GET /v1/knowledge-bases/{knowledge_base_id}/graph`                                                   | Read graph nodes and edges                   |
| `POST /v1/knowledge-bases/{knowledge_base_id}/forks/resolve`                                          | Resolve an isolated fork owner               |
| `POST /v1/forks/{fork_id}/submissions`                                                                | Submit fork-owned content                    |
| `POST /v1/knowledge-bases/{knowledge_base_id}/retrieve`                                               | Retrieve Wiki-first context                  |
| `POST /v1/knowledge-bases/{knowledge_base_id}/retrieve/expand`                                        | Expand from retrieved graph context          |
| `POST /v1/source-evidence/resolve`                                                                    | Resolve citation evidence in batch           |
| `GET /v1/webhooks`                                                                                    | List configured webhooks                     |
| `POST /v1/webhooks`                                                                                   | Create a signed webhook                      |
| `GET /openapi.json`                                                                                   | Read the protected OpenAPI 3.1 contract      |

## Advanced Setup

### Env-first Configuration

All runtime configuration is env-first. The Admin Console shows safe runtime
status and Knowledge Base settings. Provider secrets stay in `.env`.

| Area                    | Required keys                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports                   | `FOCOCONTEXT_BIND_HOST`, `FOCOCONTEXT_API_PORT`, `FOCOCONTEXT_ADMIN_PORT`, `FOCOCONTEXT_POSTGRES_PORT`, `FOCOCONTEXT_REDIS_PORT`                                                  |
| Admin auth              | `FOCOCONTEXT_ADMIN_USERNAME`, `FOCOCONTEXT_ADMIN_PASSWORD`                                                                                                                        |
| Developer API auth      | `FOCOCONTEXT_API_KEY`, `FOCOCONTEXT_CORS_ORIGINS`                                                                                                                                 |
| PostgreSQL              | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`                                                                                                               |
| Redis                   | `REDIS_URL`                                                                                                                                                                       |
| Object storage          | `S3_PROVIDER_NAME`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_OPERATION_*`, `S3_PREVIEW_*`, `S3_MULTIPART_PART_SIZE_BYTES`         |
| Chat model              | `CHAT_PROVIDER_NAME`, `CHAT_BASE_URL`, `CHAT_API_KEY`, `CHAT_*_MODEL`                                                                                                             |
| Embeddings              | `EMBEDDING_PROVIDER_NAME`, `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`                                                                   |
| Optional rerank         | `RERANK_PROVIDER_NAME`, `RERANK_BASE_URL`, `RERANK_API_KEY`, `RERANK_MODEL`                                                                                                       |
| Optional image captions | `VISION_CAPTION_ENABLED`, `VISION_CAPTION_BASE_URL`, `VISION_CAPTION_API_KEY`, `VISION_CAPTION_MODEL`                                                                             |
| OCR                     | `OCR_ENABLED`, `OCR_PROVIDER`, `OCR_SERVICE_BASE_URL`, `OCR_LANGS`, `OCR_*` limits                                                                                                |
| Source Watch            | `FOCOCONTEXT_SOURCE_WATCH_HOST_DIR`, `FOCOCONTEXT_SOURCE_WATCH_CONTAINER_DIR`, `SOURCE_WATCH_URL_LIST_*`, `SOURCE_WATCH_S3_*`, `SOURCE_WATCH_GIT_*`                               |
| Runtime limits          | `UPLOAD_*`, `PARSER_*`, `*_CONCURRENCY`, `DELETION_CLEANUP_*`, `COMPILE_MAX_CONTEXT_CHARS`, `RETRIEVE_*`, `SOURCE_EVIDENCE_*`, `RUNTIME_*`, `PROVIDER_FAILURE_DEGRADED_THRESHOLD` |
| Webhook delivery        | `FOCOCONTEXT_WEBHOOK_SECRET`, `WEBHOOK_DELIVERY_*`, `WEBHOOK_SIGNING_TOLERANCE_SECONDS`                                                                                           |

### OpenAI-compatible Providers

Chat, embedding, rerank, and vision caption providers are configured
separately. Use provider base URLs that expose OpenAI-compatible endpoints.

```bash
CHAT_BASE_URL=https://your-provider.example/v1
EMBEDDING_BASE_URL=https://your-provider.example/v1
VISION_CAPTION_BASE_URL=https://your-provider.example/v1
```

Rerank is optional. Leave every `RERANK_*` value empty to disable it. Configure
`RERANK_PROVIDER_NAME`, `RERANK_BASE_URL`, `RERANK_API_KEY`, and `RERANK_MODEL`
together to enable Retrieve reranking.

### Runtime Concurrency

`FOCOCONTEXT_QUEUE_CONCURRENCY` is the default fallback for queue-style work.
Stage-specific values override it when present: `SOURCE_PARSE_CONCURRENCY`,
`WIKI_ANALYZE_CONCURRENCY`, `WIKI_GENERATE_CONCURRENCY`,
`WIKI_MERGE_CONCURRENCY`, `BATCH_IMPORT_CONCURRENCY`,
`SOURCE_WATCH_SCAN_CONCURRENCY`, `OCR_CONCURRENCY`,
`VISION_CAPTION_CONCURRENCY`, `WEBHOOK_DELIVERY_CONCURRENCY`, and
`DELETION_CLEANUP_CONCURRENCY`.

Large background workloads use `BACKGROUND_*` controls for batch size, cursor
window size, checkpoint interval, retry pacing, and worker concurrency. OCR page
work still uses `OCR_PAGE_CONCURRENCY`; image caption provider calls still use
`VISION_CAPTION_IMAGE_CONCURRENCY`.

`PARSER_CONCURRENCY` remains supported as the source parse fallback when
`SOURCE_PARSE_CONCURRENCY` is unset. The Admin Console Settings page shows
effective runtime values without exposing secrets.

### S3-compatible Operation Governance

FocoContext tracks S3-compatible operation volume through a provider-neutral
Class A / Class B taxonomy. Class A covers write, list, multipart, copy,
lifecycle, and bucket mutation operations. Class B covers object reads and
metadata reads.

Use `S3_OPERATION_METRICS_ENABLED`, `S3_OPERATION_METRICS_WINDOW_SECONDS`,
`S3_OPERATION_CLASS_A_WARNING_THRESHOLD`, and
`S3_OPERATION_CLASS_B_WARNING_THRESHOLD` to tune pressure reporting.
`S3_PREVIEW_CACHE_ENABLED` and `S3_PREVIEW_MAX_CHARS` let parsed-content detail
responses use persisted bounded previews. `S3_MULTIPART_PART_SIZE_BYTES`
controls multipart upload part size for providers where request count affects
cost.

### Source Watch

Source Watch supports mounted-directory, S3 prefix, URL list, and Git
repository rules when the corresponding runtime adapter is enabled. Mounted
directories are read by the API container through a read-only Docker volume.

```bash
FOCOCONTEXT_SOURCE_WATCH_HOST_DIR=./examples/source-watch
FOCOCONTEXT_SOURCE_WATCH_CONTAINER_DIR=/source-watch
```

Rules support manual scans, scheduled scans, scan history, failure status,
retry/backoff metadata, and optional auto-ingest into the normal Source
Document pipeline.

## Retrieval and Webhooks

Retrieve uses Wiki Pages as the primary context surface, then combines lexical
matching, embeddings, graph expansion, citations, answerability, and an
optional context pack.

Applications and Agents should inspect `answerability.status`, `confidence`,
`evidence_sufficiency`, `no_answer`, `reason_codes`, and
`recommended_action` before using returned candidates for a source-backed final
answer. `confidence` is a deterministic retrieval-evidence score.

Webhook subscriptions can be created through the API or Admin Console. Delivery
uses signed JSON payloads with `x-fococontext-delivery-id`,
`x-fococontext-timestamp`, `x-fococontext-content-digest`, and
`x-fococontext-signature` headers when `FOCOCONTEXT_WEBHOOK_SECRET` or a
subscription secret is configured.

## Fork-owned Submissions

Fork submissions let developer applications or user-facing Agents write
generated Markdown/text into a fork Knowledge Base. Canonical retrieval excludes
fork-owned submitted content. Fork retrieval combines upstream canonical pages
with that fork's private overlay.

Typical API flow:

1. Create and ingest a canonical Knowledge Base.
2. Resolve a fork with `owner_type` and `external_owner_id`.
3. Generate or collect user-owned content in your own application.
4. Submit `POST /v1/forks/{fork_id}/submissions`.
5. Poll the returned `job.id` with `GET /v1/jobs/{job_id}`.
6. Retrieve from `/v1/knowledge-bases/{fork_id}/retrieve`.
7. Sync or delete the fork when needed.

## Project Layout

```text
apps/api          REST API and Admin auth
apps/worker       Queue workers and compile pipeline
apps/admin-web    React, Vite, shadcn/ui Admin Console
apps/ocr-service  Optional RapidOCR sidecar
apps/docs-site    VitePress documentation site
packages/*        Shared contracts, storage, parser, graph, retrieval, SDK
examples          API-only and SDK quickstarts
```

## Troubleshooting

| Symptom                         | Check                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Admin login fails               | Confirm `FOCOCONTEXT_ADMIN_USERNAME` and `FOCOCONTEXT_ADMIN_PASSWORD` in `.env`, then restart API/Admin containers  |
| API returns 401                 | Use `Authorization: Bearer <FOCOCONTEXT_API_KEY>` for `/v1` routes                                                  |
| Upload fails                    | Check S3 credentials, bucket existence, `S3_FORCE_PATH_STYLE`, and upload size limits                               |
| Jobs stay queued                | Check Worker health, Redis health, and `FOCOCONTEXT_QUEUE_CONCURRENCY`                                              |
| Deleted resources remain in S3  | Check the `deletion.cleanup` worker, `DELETION_CLEANUP_*` limits, and Settings -> Operations for retryable failures |
| Scanned PDFs produce no content | Use the default full-stack Compose template or start OCR through `docker-compose.optional-ocr.example.yml`          |
| Image captions are skipped      | Enable `VISION_CAPTION_ENABLED` and configure a vision-capable OpenAI-compatible model                              |
| Source Watch finds nothing      | Use the container path under `FOCOCONTEXT_SOURCE_WATCH_CONTAINER_DIR`, not the host path                            |
| Retrieval has no results        | Wait for ingest completion, check embeddings, and rebuild indexes from Knowledge Base Settings                      |

## Contributing

For code, documentation, deployment, and developer-experience contributions,
see the [Contribution Guide](CONTRIBUTING.md).

Focused bug fixes, OpenAPI improvements, parser and retrieval work, Admin UI
polish, and self-hosting documentation are all welcome.

## Community & Contact

Use GitHub Issues for bugs and focused feature requests. Use GitHub Discussions
for product questions, integration patterns, and self-hosting notes.

## Staying Ahead

Star FocoContext on GitHub to follow new releases and product updates.

## Security

- Keep `.env` local. Commit `.env.example`, never `.env`.
- Keep `docker-compose.yml` local. Commit the example Compose templates.
- Provider API keys, object storage credentials, admin credentials, and webhook
  secrets are env-only.
- The Admin Console exposes safe status metadata and masked configuration.
- See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Special Thanks

FocoContext is inspired by
[Andrej Karpathy's LLM Wiki idea](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
and the
[nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) project.

## License

FocoContext is released under a modified Apache License 2.0 with additional
conditions for multi-tenant services and frontend logo/copyright information.
See [LICENSE](LICENSE) for the full license terms.
