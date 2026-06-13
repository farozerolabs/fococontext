# Env Reference

## Runtime Ports

| Field                       | Description       | Recommended Value                                                                                 |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `FOCOCONTEXT_BIND_HOST`     | Compose bind host | Use `127.0.0.1` for reverse proxy deployments; use `0.0.0.0` only for intentional direct exposure |
| `FOCOCONTEXT_API_PORT`      | Numeric host port | Use `18080` locally; map through reverse proxy in production                                      |
| `FOCOCONTEXT_ADMIN_PORT`    | Numeric host port | Use `18081` locally; expose only the frontend domain in production                                |
| `FOCOCONTEXT_POSTGRES_PORT` | Numeric host port | Use `18432` locally; do not expose production database publicly                                   |
| `FOCOCONTEXT_REDIS_PORT`    | Numeric host port | Use `18379` locally; do not expose production Redis publicly                                      |

Keep `FOCOCONTEXT_*_PORT` values numeric. Put the host bind address in
`FOCOCONTEXT_BIND_HOST`; do not set `FOCOCONTEXT_API_PORT` or
`FOCOCONTEXT_ADMIN_PORT` to values such as `127.0.0.1:18080`.

## Release Image

| Field                         | Description                | Recommended Value                                                         |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `FOCOCONTEXT_IMAGE_TAG`       | Published Docker image tag | Required by `docker-compose.example.yml`; use the release tag without `v` |
| `FOCOCONTEXT_IMAGE_NAMESPACE` | Docker image namespace     | Use `ghcr.io/farozerolabs` for the public GHCR images                     |

## Admin and OpenAPI Access

| Field                                            | Description                  | Recommended Value                                                                                             |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FOCOCONTEXT_ADMIN_USERNAME`                     | Admin username               | `admin` is fine locally; use a less guessable name in production                                              |
| `FOCOCONTEXT_ADMIN_PASSWORD`                     | Admin password               | Random password with at least 16 characters                                                                   |
| `FOCOCONTEXT_ADMIN_SESSION_TTL_SECONDS`          | Admin session TTL in seconds | Default `604800`, 7 days                                                                                      |
| `FOCOCONTEXT_ADMIN_LOGIN_FAILURE_LIMIT`          | Login failure threshold      | Default `5`; repeated failures are throttled without account enumeration                                      |
| `FOCOCONTEXT_ADMIN_LOGIN_FAILURE_WINDOW_SECONDS` | Login failure window         | Default `300`                                                                                                 |
| `FOCOCONTEXT_ADMIN_LOGIN_LOCKOUT_SECONDS`        | Login lockout duration       | Default `900`                                                                                                 |
| `FOCOCONTEXT_ADMIN_COOKIE_SECURE`                | Secure Admin cookie          | Use `true` for HTTPS production deployments                                                                   |
| `FOCOCONTEXT_ADMIN_COOKIE_SAMESITE`              | Admin cookie SameSite mode   | Default `lax`; align with your reverse-proxy and domain setup                                                 |
| `FOCOCONTEXT_API_KEY`                            | Bearer API Key               | Random value with at least 32 characters, stored server-side only                                             |
| `FOCOCONTEXT_CORS_ORIGINS`                       | Comma-separated origins      | Local default is `http://localhost:18081,http://127.0.0.1:18081`; production should list trusted domains only |
| `FOCOCONTEXT_ADMIN_API_BASE_URL`                 | API base URL used by Admin   | Compose local value is `http://localhost:18080/v1`; use your public API route behind a proxy                  |
| `FOCOCONTEXT_ADMIN_BASE_URL`                     | Admin base URL               | Local value is `http://localhost:18081`; production should use an HTTPS domain                                |

## Security Headers, Audit, and Rate Limits

| Field                                     | Description                         | Recommended Value                                           |
| ----------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `SECURITY_HEADERS_ENABLED`                | Enable security headers             | Default `true`                                              |
| `SECURITY_HSTS_ENABLED`                   | Enable HSTS                         | Enable only after HTTPS is stable                           |
| `SECURITY_HSTS_MAX_AGE_SECONDS`           | HSTS max age                        | Default `15552000`                                          |
| `SECURITY_AUDIT_ENABLED`                  | Persist security audit events       | Default `true`                                              |
| `SECURITY_AUDIT_RETENTION_DAYS`           | Security audit retention            | Default `90`                                                |
| `SECURITY_AUDIT_MAX_METADATA_BYTES`       | Max audit metadata size             | Default `4096`                                              |
| `SECURITY_AUDIT_COUNTER_WINDOW_SECONDS`   | Redis audit counter window          | Default `300`                                               |
| `SECURITY_AUDIT_COUNTER_TTL_SECONDS`      | Redis audit counter TTL             | Default `3600`                                              |
| `SECURITY_RATE_LIMIT_ENABLED`             | Enable route rate limiting          | Default `true`                                              |
| `SECURITY_RATE_LIMIT_WINDOW_SECONDS`      | Rate-limit window                   | Default `60`                                                |
| `SECURITY_RATE_LIMIT_PUBLIC_HEALTH_MAX`   | Public health requests per window   | Default `120`                                               |
| `SECURITY_RATE_LIMIT_OPENAPI_MAX`         | OpenAPI JSON requests per window    | Default `30`                                                |
| `SECURITY_RATE_LIMIT_LOGIN_MAX`           | Login requests per window           | Default `10`                                                |
| `SECURITY_RATE_LIMIT_DIAGNOSTICS_MAX`     | Diagnostics requests per window     | Default `30`                                                |
| `SECURITY_RATE_LIMIT_DEFAULT_API_MAX`     | Default protected API limit         | Default `300`                                               |
| `SECURITY_RATE_LIMIT_RETRIEVE_MAX`        | Retrieve requests per window        | Default `60`                                                |
| `SECURITY_RATE_LIMIT_SOURCE_EVIDENCE_MAX` | Source Evidence requests per window | Default `120`                                               |
| `SECURITY_RATE_LIMIT_UPLOAD_MAX`          | Built-in upload requests per window | Default `30`                                                |
| `SECURITY_RATE_LIMIT_DIRECT_UPLOAD_MAX`   | Direct upload requests per window   | Default `30`                                                |
| `SECURITY_RATE_LIMIT_EXPORT_MAX`          | Export requests per window          | Default `10`                                                |
| `SECURITY_RATE_LIMIT_CLEANUP_MAX`         | Cleanup requests per window         | Default `10`                                                |
| `SECURITY_RATE_LIMIT_WEBHOOK_MAX`         | Webhook requests per window         | Default `60`                                                |
| `SECURITY_RATE_LIMIT_ADMIN_EXPENSIVE_MAX` | Expensive Admin requests per window | Default `30`; tune for trusted operator workflows carefully |

## Source Watch Mounted Directory

| Field                                    | Description         | Recommended Value                                                                   |
| ---------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `FOCOCONTEXT_SOURCE_WATCH_HOST_DIR`      | Host directory      | Use `./examples/source-watch` locally; use a dedicated data directory in production |
| `FOCOCONTEXT_SOURCE_WATCH_CONTAINER_DIR` | Container directory | Keep `/source-watch`; create rules with this path or a child path                   |

## Source Watch Remote Network Safety

| Field                                    | Description                     | Recommended Value                                                                 |
| ---------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| `SOURCE_WATCH_PRIVATE_NETWORK_ENABLED`   | Allow private-network targets   | Default `false`; enable only for trusted intranet ingestion                       |
| `SOURCE_WATCH_PRIVATE_NETWORK_ALLOWLIST` | Host, IP, or CIDR allowlist     | Empty by default; required when private-network targets are enabled               |
| `PARSER_REMOTE_IMAGE_FETCHING_ENABLED`   | Fetch remote images from inputs | Default `false`; keep disabled unless the deployment has explicit egress controls |

## Source Watch URL List

| Field                                       | Description                      | Recommended Value                                       |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `SOURCE_WATCH_URL_LIST_ENABLED`             | `true` / `false`                 | Keep `false` until URL safety policy is ready           |
| `SOURCE_WATCH_URL_LIST_PROTOCOLS`           | Comma-separated protocols        | Use `https` in production; `http,https` is fine locally |
| `SOURCE_WATCH_URL_LIST_MAX_URLS`            | Max URLs per rule                | Default `100`; split large imports into multiple rules  |
| `SOURCE_WATCH_URL_LIST_MAX_RESPONSE_BYTES`  | Max bytes per URL response       | Default `1048576`; increase for larger pages            |
| `SOURCE_WATCH_URL_LIST_TIMEOUT_SECONDS`     | Request timeout                  | Default `15`; slow sites may need `30`                  |
| `SOURCE_WATCH_URL_LIST_REDIRECT_LIMIT`      | Redirect count                   | Default `3`                                             |
| `SOURCE_WATCH_URL_LIST_MAX_RETRIES`         | Retry count                      | Default `2`                                             |
| `SOURCE_WATCH_URL_LIST_RETRY_BASE_DELAY_MS` | Base retry delay in milliseconds | Default `500`                                           |
| `SOURCE_WATCH_URL_LIST_CONCURRENCY`         | URL fetch concurrency            | Default `2`; increase gradually                         |

## Source Watch S3

| Field                                      | Description                      | Recommended Value                                                  |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------ |
| `SOURCE_WATCH_S3_ENABLED`                  | `true` / `false`                 | Keep `false` until user source S3 is configured                    |
| `SOURCE_WATCH_S3_ENDPOINT`                 | S3-compatible endpoint           | Use the source bucket endpoint                                     |
| `SOURCE_WATCH_S3_REGION`                   | Region                           | Match provider region; R2-style services may use `auto`            |
| `SOURCE_WATCH_S3_BUCKET`                   | Bucket name                      | Use a bucket with least required permissions                       |
| `SOURCE_WATCH_S3_ACCESS_KEY_ID`            | Access key                       | Use a data-source-specific key                                     |
| `SOURCE_WATCH_S3_SECRET_ACCESS_KEY`        | Secret key                       | Use a data-source-specific secret                                  |
| `SOURCE_WATCH_S3_FORCE_PATH_STYLE`         | `true` / `false`                 | Compatible services often need `true`; AWS S3 usually uses `false` |
| `SOURCE_WATCH_S3_MAX_OBJECTS`              | Max objects per scan             | Default `1000`                                                     |
| `SOURCE_WATCH_S3_MAX_OBJECT_BYTES`         | Max object size                  | Default `20971520`, about 20 MB                                    |
| `SOURCE_WATCH_S3_TIMEOUT_SECONDS`          | Request timeout                  | Default `30`                                                       |
| `SOURCE_WATCH_S3_MAX_RETRIES`              | Retry count                      | Default `2`                                                        |
| `SOURCE_WATCH_S3_RETRY_BASE_DELAY_MS`      | Base retry delay in milliseconds | Default `500`                                                      |
| `SOURCE_WATCH_S3_CONCURRENCY`              | S3 scan concurrency              | Default `2`                                                        |
| `SOURCE_WATCH_S3_INCREMENTAL_SCAN_ENABLED` | Metadata-first repeat scans      | Default `true`; unchanged fingerprints avoid object body reads     |

## Source Watch Git

| Field                                  | Description                      | Recommended Value                                                                   |
| -------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `SOURCE_WATCH_GIT_ENABLED`             | `true` / `false`                 | Keep `false` until token and path filters are ready                                 |
| `SOURCE_WATCH_GIT_PROTOCOLS`           | `https` or allowed protocol list | Use `https` in production                                                           |
| `SOURCE_WATCH_GIT_TOKEN`               | Git access token                 | Leave empty for public repositories; use a read-only token for private repositories |
| `SOURCE_WATCH_GIT_CLONE_DEPTH`         | Clone depth                      | Default `1`                                                                         |
| `SOURCE_WATCH_GIT_TEMP_DIR`            | Container temp directory         | Default `/tmp/fococontext-git-watch`                                                |
| `SOURCE_WATCH_GIT_MAX_FILES`           | Max files per scan               | Default `2000`                                                                      |
| `SOURCE_WATCH_GIT_MAX_FILE_BYTES`      | Max file size                    | Default `20971520`, about 20 MB                                                     |
| `SOURCE_WATCH_GIT_TIMEOUT_SECONDS`     | Clone or scan timeout            | Default `60`                                                                        |
| `SOURCE_WATCH_GIT_MAX_RETRIES`         | Retry count                      | Default `1`                                                                         |
| `SOURCE_WATCH_GIT_RETRY_BASE_DELAY_MS` | Base retry delay in milliseconds | Default `1000`                                                                      |
| `SOURCE_WATCH_GIT_CONCURRENCY`         | Git scan concurrency             | Default `2`                                                                         |

## PostgreSQL and Redis

| Field               | Description                  | Recommended Value                                                                |
| ------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `POSTGRES_USER`     | Database username            | Use `fococontext` locally; use a dedicated account in production                 |
| `POSTGRES_PASSWORD` | Database password            | Strong random password                                                           |
| `POSTGRES_DB`       | Database name                | Default `fococontext`                                                            |
| `DATABASE_URL`      | PostgreSQL connection string | Compose uses `postgres:5432`; production should use an internal database address |
| `REDIS_URL`         | Redis connection string      | Compose uses `redis://redis:6379`; production should use internal Redis          |

## System Object Storage S3

| Field                  | Description            | Recommended Value                                                                |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| `S3_PROVIDER_NAME`     | Display name           | Examples: `AWS S3`, `Cloudflare R2`, `Ceph RGW`                                  |
| `S3_ENDPOINT`          | S3-compatible endpoint | Use your real object storage endpoint                                            |
| `S3_REGION`            | Region                 | Match provider region; R2-style services may use `auto`                          |
| `S3_BUCKET`            | Bucket name            | Use a dedicated FocoContext bucket                                               |
| `S3_ACCESS_KEY_ID`     | Access key             | Use a dedicated least-privilege key                                              |
| `S3_SECRET_ACCESS_KEY` | Secret key             | Use a dedicated secret                                                           |
| `S3_FORCE_PATH_STYLE`  | `true` / `false`       | AWS S3 usually uses `false`; compatible services depend on provider requirements |
| `S3_PUBLIC_BASE_URL`   | Public base URL        | Leave empty when no public preview domain exists                                 |

## S3-Compatible Operation Tuning

These settings are provider-neutral. Class A covers write, list, multipart, copy, lifecycle, and bucket mutation operations. Class B covers object reads and metadata reads. Exact billing names, prices, free tiers, and rounding depend on the configured S3-compatible provider.

| Field                                    | Description                          | Recommended Value                           |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------- |
| `S3_OPERATION_METRICS_ENABLED`           | Record operation counters            | Default `true`                              |
| `S3_OPERATION_PRESSURE_WARNINGS_ENABLED` | Enable pressure warnings             | Default `true`                              |
| `S3_OPERATION_METRICS_WINDOW_SECONDS`    | Recent metrics window                | Default `300`                               |
| `S3_OPERATION_CLASS_A_WARNING_THRESHOLD` | Class A warning count per window     | Default `1000`                              |
| `S3_OPERATION_CLASS_B_WARNING_THRESHOLD` | Class B warning count per window     | Default `10000`                             |
| `S3_PREVIEW_CACHE_ENABLED`               | Use persisted parsed preview data    | Default `true`                              |
| `S3_PREVIEW_MAX_CHARS`                   | Max persisted markdown preview chars | Default `200000`                            |
| `S3_MULTIPART_PART_SIZE_BYTES`           | Multipart upload part size           | Default `16777216`; minimum S3 part is 5 MB |

## Chat, Embedding, and Rerank

| Field                      | Description                               | Recommended Value                                             |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `CHAT_PROVIDER_NAME`       | Chat provider display name                | Examples: `OpenAI`, `OpenRouter`, `Local Gateway`             |
| `CHAT_BASE_URL`            | OpenAI-compatible base URL                | Use the provider `/v1` base URL                               |
| `CHAT_API_KEY`             | Chat provider key                         | Store as server-side secret                                   |
| `CHAT_DEFAULT_MODEL`       | Default text model                        | Can match analysis, generation, and merge models              |
| `CHAT_ANALYSIS_MODEL`      | Source analysis model                     | Choose stable structured output and sufficient context        |
| `CHAT_GENERATION_MODEL`    | Wiki generation model                     | Choose stable long-form generation                            |
| `CHAT_MERGE_MODEL`         | Page merge model                          | Choose strong instruction following and citation preservation |
| `CHAT_REQUEST_MAX_RETRIES` | Additional retries for retryable failures | Default `2`; increase when provider rate limits are common    |
| `EMBEDDING_PROVIDER_NAME`  | Embedding provider display name           | Examples: `OpenAI`, `Jina`, `Local Embedding`                 |
| `EMBEDDING_BASE_URL`       | OpenAI-compatible embedding base URL      | Use the provider `/v1` base URL                               |
| `EMBEDDING_API_KEY`        | Embedding provider key                    | Store as server-side secret                                   |
| `EMBEDDING_MODEL`          | Embedding model name                      | Must match `EMBEDDING_DIMENSIONS`                             |
| `EMBEDDING_DIMENSIONS`     | Vector dimensions                         | Use the model-required value; default `1536`                  |
| `RERANK_PROVIDER_NAME`     | Rerank provider display name              | Leave empty when rerank is disabled                           |
| `RERANK_BASE_URL`          | Rerank base URL                           | Leave empty when disabled                                     |
| `RERANK_API_KEY`           | Rerank key                                | Leave empty when disabled                                     |
| `RERANK_MODEL`             | Rerank model name                         | Leave empty when disabled                                     |

Rerank uses an all-or-none contract. Leave every `RERANK_*` value empty to disable rerank. Configure `RERANK_PROVIDER_NAME`, `RERANK_BASE_URL`, `RERANK_API_KEY`, and `RERANK_MODEL` together to enable optional Retrieve reranking. Partial configuration is invalid because Retrieve cannot safely report a usable rerank provider.

## Vision Caption

| Field                                    | Description                        | Recommended Value                                      |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `VISION_CAPTION_ENABLED`                 | `true` / `false`                   | Keep `false` when no vision model is configured        |
| `VISION_CAPTION_PROVIDER_NAME`           | Vision provider display name       | Examples: `OpenAI Vision`, `Qwen VL`                   |
| `VISION_CAPTION_BASE_URL`                | OpenAI-compatible base URL         | Use a provider that supports image input               |
| `VISION_CAPTION_API_KEY`                 | Vision provider key                | Store as server-side secret                            |
| `VISION_CAPTION_MODEL`                   | Image-capable model name           | Choose a model that describes document images reliably |
| `VISION_CAPTION_MAX_RETRIES`             | Retry count                        | Default `2`                                            |
| `VISION_CAPTION_RETRY_BASE_DELAY_MS`     | Base retry delay in milliseconds   | Default `500`                                          |
| `VISION_CAPTION_CONCURRENCY`             | Caption job concurrency            | Default `1`; tune by provider rate limits              |
| `VISION_CAPTION_IMAGE_CONCURRENCY`       | Per-job image concurrency          | Default `1`; increase carefully for large documents    |
| `VISION_CAPTION_TIMEOUT_SECONDS`         | Request timeout                    | Default `60`                                           |
| `VISION_CAPTION_MAX_IMAGES_PER_DOCUMENT` | Max images per document            | Default `100`                                          |
| `VISION_CAPTION_CONTEXT_CHARS`           | Nearby Markdown context characters | Default `200`                                          |
| `VISION_CAPTION_MAX_OUTPUT_TOKENS`       | Caption output token limit         | Default `160`                                          |

## OCR

| Field                         | Description                            | Recommended Value                                                                             |
| ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `OCR_ENABLED`                 | `true` / `false`                       | Default `true` with the bundled Compose OCR service; set `false` to disable OCR intentionally |
| `OCR_PROVIDER`                | Provider name                          | Default `rapidocr`                                                                            |
| `OCR_SERVICE_BASE_URL`        | OCR service URL                        | Bundled Compose uses `http://ocr-service:18082`                                               |
| `OCR_SERVICE_API_KEY`         | OCR service key                        | Empty is allowed without auth; configure one in production                                    |
| `OCR_LANGS`                   | Comma-separated languages              | Use `ch,en` for Chinese and English documents                                                 |
| `OCR_PAGE_DPI`                | PDF render DPI                         | Default `180`; higher values are slower                                                       |
| `OCR_MAX_PAGES_PER_DOCUMENT`  | Max OCR pages per document             | Default `200`                                                                                 |
| `OCR_MAX_PAGE_PIXELS`         | Max pixels per page                    | Default `20000000`                                                                            |
| `OCR_CONCURRENCY`             | OCR job concurrency                    | Default `1`                                                                                   |
| `OCR_PAGE_CONCURRENCY`        | Per-job page concurrency               | Default `1`                                                                                   |
| `OCR_TIMEOUT_SECONDS`         | OCR timeout                            | Default `60`                                                                                  |
| `OCR_MAX_RETRIES`             | OCR retry count                        | Default `2`                                                                                   |
| `OCR_RETRY_BASE_DELAY_MS`     | Base retry delay in milliseconds       | Default `500`                                                                                 |
| `OCR_MIN_TEXT_CHARS_PER_PAGE` | Low-text threshold for OCR eligibility | Default `80`                                                                                  |
| `OCR_CONFIDENCE_THRESHOLD`    | OCR confidence threshold               | Default `0.5`                                                                                 |
| `OCR_STORE_PAGE_IMAGES`       | Whether to store OCR page images       | Default `false`; keep disabled for privacy-sensitive documents                                |

## Async Deletion Cleanup

| Field                                       | Description                      | Recommended Value                               |
| ------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| `DELETION_CLEANUP_CONCURRENCY`              | Cleanup concurrency              | Default `1`; increase for large storage cleanup |
| `DELETION_CLEANUP_OBJECT_BATCH_SIZE`        | S3 object batch size             | Default `100`                                   |
| `DELETION_CLEANUP_MAX_RETRIES`              | Max retry count                  | Default `3`                                     |
| `DELETION_CLEANUP_RETRY_BASE_DELAY_MS`      | Base retry delay in milliseconds | Default `1000`                                  |
| `DELETION_CLEANUP_RETRY_BACKOFF`            | `fixed` / `exponential`          | Use `exponential`                               |
| `DELETION_CLEANUP_OPERATION_RETENTION_DAYS` | Operation summary retention days | Empty keeps compact summaries indefinitely      |
| `DELETION_CLEANUP_ITEM_RETENTION_DAYS`      | Cleanup item retention days      | Default `30`                                    |

## Upload, Runtime Pressure, and Parser

| Field                                        | Description                                    | Recommended Value                                 |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `UPLOAD_MAX_FILE_SIZE_MB`                    | Max upload file size in MB                     | Default `50`; tune with API gateway and S3 limits |
| `UPLOAD_MAX_CONCURRENT_FILES`                | Browser upload concurrency                     | Default `3`                                       |
| `UPLOAD_DIRECT_ENABLED`                      | `true` / `false`                               | Enable after direct upload flow is configured     |
| `UPLOAD_DIRECT_THRESHOLD_MB`                 | Size threshold for direct upload               | Default `50`                                      |
| `UPLOAD_SESSION_EXPIRES_SECONDS`             | Upload session TTL                             | Default `900`                                     |
| `UPLOAD_MULTIPART_FALLBACK_MODE`             | `enabled` / `disabled`                         | Default `enabled`                                 |
| `UPLOAD_MULTIPART_TIMEOUT_SECONDS`           | Multipart timeout                              | Default `300`                                     |
| `UPLOAD_PRESSURE_DEGRADED_THRESHOLD`         | Upload pressure degraded threshold             | Default `3`                                       |
| `RUNTIME_QUEUE_DEPTH_DEGRADED_THRESHOLD`     | Runtime queue degraded threshold               | Default `20`                                      |
| `RUNTIME_QUEUE_DEPTH_SATURATED_THRESHOLD`    | Runtime queue saturated threshold              | Default `100`                                     |
| `COMPILE_QUEUE_DEPTH_DEGRADED_THRESHOLD`     | Compile queue degraded threshold               | Default `10`                                      |
| `COMPILE_QUEUE_DEPTH_SATURATED_THRESHOLD`    | Compile queue saturated threshold              | Default `50`                                      |
| `PROVIDER_FAILURE_DEGRADED_THRESHOLD`        | Provider failure degraded threshold            | Default `3`                                       |
| `PARSER_MAX_FILE_SIZE_MB`                    | Parser file size limit                         | Default `50`                                      |
| `PARSER_TIMEOUT_SECONDS`                     | Parser timeout                                 | Default `120`                                     |
| `PARSER_CONCURRENCY`                         | Parser concurrency compatibility fallback      | Default `2`                                       |
| `SOURCE_PARSE_CONCURRENCY`                   | Source parsing stage concurrency               | Default `2`                                       |
| `PARSER_ZIP_MAX_ENTRIES`                     | Max archive entries before parsing             | Default `10000`                                   |
| `PARSER_ZIP_MAX_EXPANDED_MB`                 | Max total expanded archive size in MB          | Default `1000`                                    |
| `PARSER_ZIP_MAX_ENTRY_MB`                    | Max single archive entry size in MB            | Default `50`                                      |
| `PARSER_MEDIA_UPLOAD_CONCURRENCY`            | Extracted media upload concurrency             | Default `2`                                       |
| `PARSER_MAX_IMAGES_PER_DOCUMENT`             | Max extracted visual assets per document       | Default `50`                                      |
| `PARSER_MAX_RENDERED_SNAPSHOTS_PER_DOCUMENT` | Max rendered page/sheet snapshots per document | Default `10`                                      |
| `PARSER_MAX_IMAGE_PIXELS`                    | Max pixels per extracted image                 | Default `16000000`                                |
| `PARSER_MAX_IMAGE_BYTES`                     | Max bytes per extracted image                  | Default `10485760`                                |
| `PARSER_MIN_IMAGE_WIDTH`                     | Minimum image width                            | Default `64`                                      |
| `PARSER_MIN_IMAGE_HEIGHT`                    | Minimum image height                           | Default `64`                                      |
| `PARSER_VISUAL_EXTRACTION_CONCURRENCY`       | Per-document visual extraction concurrency     | Default `2`                                       |
| `PARSER_REMOTE_IMAGE_FETCHING_ENABLED`       | Remote Markdown/HTML image fetching            | Default `false`                                   |
| `PARSER_PDF_SNAPSHOT_MIN_TEXT_CHARS`         | PDF page snapshot threshold for low-text pages | Default `80`                                      |

## Document Processing State

| Field                                          | Description                                      | Recommended Value |
| ---------------------------------------------- | ------------------------------------------------ | ----------------- |
| `DOCUMENT_PROCESSING_MARKDOWN_WINDOW_CHARS`    | Markdown window artifact size                    | Default `64000`   |
| `DOCUMENT_PROCESSING_DETAIL_DEFAULT_PAGE_SIZE` | Default page size for processing detail reads    | Default `50`      |
| `DOCUMENT_PROCESSING_DETAIL_MAX_PAGE_SIZE`     | Max page size for processing detail reads        | Default `200`     |
| `DOCUMENT_PROCESSING_CLEANUP_BATCH_SIZE`       | Expired intermediate cleanup batch size          | Default `500`     |
| `DOCUMENT_PROCESSING_SUCCESS_RETENTION_DAYS`   | Successful intermediate detail retention in days | Default `7`       |
| `DOCUMENT_PROCESSING_FAILURE_RETENTION_DAYS`   | Failed intermediate detail retention in days     | Default `30`      |

## Queues, Compile, and Retrieve

| Field                                            | Description                                  | Recommended Value                                     |
| ------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| `FOCOCONTEXT_QUEUE_CONCURRENCY`                  | Default queue concurrency                    | Default `2`                                           |
| `BATCH_IMPORT_CONCURRENCY`                       | Batch import concurrency                     | Default `2`                                           |
| `SOURCE_WATCH_SCAN_CONCURRENCY`                  | Source Watch scan concurrency                | Default `2`                                           |
| `BACKGROUND_REINDEX_BATCH_SIZE`                  | Reindex batch size                           | Default `100`                                         |
| `BACKGROUND_REINDEX_CURSOR_WINDOW_SIZE`          | Reindex cursor window                        | Default `100`                                         |
| `BACKGROUND_REINDEX_CHECKPOINT_INTERVAL`         | Reindex checkpoint interval                  | Default `1`                                           |
| `BACKGROUND_REINDEX_RETRY_BASE_DELAY_MS`         | Reindex retry base delay                     | Default `1000`                                        |
| `BACKGROUND_REINDEX_CONCURRENCY`                 | Reindex concurrency                          | Defaults to `FOCOCONTEXT_QUEUE_CONCURRENCY`           |
| `BACKGROUND_GRAPH_INSIGHTS_BATCH_SIZE`           | Graph insight batch size                     | Default `100`                                         |
| `BACKGROUND_GRAPH_INSIGHTS_CURSOR_WINDOW_SIZE`   | Graph insight cursor window                  | Default `100`                                         |
| `BACKGROUND_GRAPH_INSIGHTS_CHECKPOINT_INTERVAL`  | Graph insight checkpoint interval            | Default `1`                                           |
| `BACKGROUND_GRAPH_INSIGHTS_RETRY_BASE_DELAY_MS`  | Graph insight retry base delay               | Default `1000`                                        |
| `BACKGROUND_GRAPH_INSIGHTS_CONCURRENCY`          | Graph insight concurrency                    | Defaults to `FOCOCONTEXT_QUEUE_CONCURRENCY`           |
| `BACKGROUND_KNOWLEDGE_CHECK_BATCH_SIZE`          | Knowledge Check batch size                   | Default `100`                                         |
| `BACKGROUND_KNOWLEDGE_CHECK_CURSOR_WINDOW_SIZE`  | Knowledge Check cursor window                | Default `100`                                         |
| `BACKGROUND_KNOWLEDGE_CHECK_CHECKPOINT_INTERVAL` | Knowledge Check checkpoint interval          | Default `1`                                           |
| `BACKGROUND_KNOWLEDGE_CHECK_RETRY_BASE_DELAY_MS` | Knowledge Check retry base delay             | Default `1000`                                        |
| `BACKGROUND_KNOWLEDGE_CHECK_CONCURRENCY`         | Knowledge Check concurrency                  | Defaults to `FOCOCONTEXT_QUEUE_CONCURRENCY`           |
| `BACKGROUND_SOURCE_WATCH_BATCH_SIZE`             | Source Watch background batch size           | Default `100`                                         |
| `BACKGROUND_SOURCE_WATCH_CURSOR_WINDOW_SIZE`     | Source Watch background cursor window        | Default `100`                                         |
| `BACKGROUND_SOURCE_WATCH_CHECKPOINT_INTERVAL`    | Source Watch background checkpoint interval  | Default `1`                                           |
| `BACKGROUND_SOURCE_WATCH_RETRY_BASE_DELAY_MS`    | Source Watch background retry base delay     | Default `1000`                                        |
| `BACKGROUND_SOURCE_WATCH_CONCURRENCY`            | Source Watch background concurrency          | Defaults to `FOCOCONTEXT_QUEUE_CONCURRENCY`           |
| `BACKGROUND_OCR_BATCH_SIZE`                      | OCR background batch size                    | Default `100`                                         |
| `BACKGROUND_OCR_CURSOR_WINDOW_SIZE`              | OCR background cursor window                 | Default `100`                                         |
| `BACKGROUND_OCR_CHECKPOINT_INTERVAL`             | OCR background checkpoint interval           | Default `1`                                           |
| `BACKGROUND_OCR_RETRY_BASE_DELAY_MS`             | OCR background retry base delay              | Default `1000`                                        |
| `BACKGROUND_OCR_CONCURRENCY`                     | OCR background concurrency                   | Defaults to `FOCOCONTEXT_QUEUE_CONCURRENCY`           |
| `BACKGROUND_MEDIA_CAPTION_BATCH_SIZE`            | Media caption background batch size          | Default `100`                                         |
| `BACKGROUND_MEDIA_CAPTION_CURSOR_WINDOW_SIZE`    | Media caption background cursor window       | Default `100`                                         |
| `BACKGROUND_MEDIA_CAPTION_CHECKPOINT_INTERVAL`   | Media caption background checkpoint interval | Default `1`                                           |
| `BACKGROUND_MEDIA_CAPTION_RETRY_BASE_DELAY_MS`   | Media caption background retry base delay    | Default `1000`                                        |
| `BACKGROUND_MEDIA_CAPTION_CONCURRENCY`           | Media caption background concurrency         | Defaults to `FOCOCONTEXT_QUEUE_CONCURRENCY`           |
| `BACKGROUND_CLEANUP_BATCH_SIZE`                  | Cleanup batch size                           | Default `100`                                         |
| `BACKGROUND_CLEANUP_CURSOR_WINDOW_SIZE`          | Cleanup cursor window                        | Default `100`                                         |
| `BACKGROUND_CLEANUP_CHECKPOINT_INTERVAL`         | Cleanup checkpoint interval                  | Default `1`                                           |
| `BACKGROUND_CLEANUP_RETRY_BASE_DELAY_MS`         | Cleanup retry base delay                     | Default `1000`                                        |
| `BACKGROUND_CLEANUP_CONCURRENCY`                 | Cleanup concurrency                          | Defaults to `FOCOCONTEXT_QUEUE_CONCURRENCY`           |
| `RESIDUAL_GRAPH_INSIGHTS_SUMMARY_WINDOW_SIZE`    | Graph insight residual summary window        | Default `100`                                         |
| `RESIDUAL_GRAPH_INSIGHTS_CHECKPOINT_INTERVAL`    | Graph insight residual checkpoint interval   | Default `1`                                           |
| `RESIDUAL_SOURCE_WATCH_COMPARISON_WINDOW_SIZE`   | Source Watch residual comparison window      | Default `100`                                         |
| `RESIDUAL_SOURCE_WATCH_CHECKPOINT_INTERVAL`      | Source Watch residual checkpoint interval    | Default `1`                                           |
| `RESIDUAL_SOURCE_WATCH_SMALL_URL_LIST_LIMIT`     | Source Watch small URL list limit            | Defaults to `SOURCE_WATCH_URL_LIST_MAX_URLS`          |
| `RESIDUAL_OCR_PAGE_WINDOW_SIZE`                  | OCR residual page window                     | Default `100`                                         |
| `RESIDUAL_OCR_CHECKPOINT_INTERVAL`               | OCR residual checkpoint interval             | Default `1`                                           |
| `RESIDUAL_MEDIA_CAPTION_ASSET_WINDOW_SIZE`       | Media caption residual asset window          | Default `100`                                         |
| `RESIDUAL_MEDIA_CAPTION_CHECKPOINT_INTERVAL`     | Media caption residual checkpoint interval   | Default `1`                                           |
| `SOURCE_WATCH_SCHEDULER_ENABLED`                 | Whether scheduled scans run                  | Default `true`                                        |
| `SOURCE_WATCH_SCAN_INTERVAL_SECONDS`             | Scan interval                                | Default `3600`                                        |
| `SOURCE_WATCH_SCAN_MAX_RETRIES`                  | Scan retry count                             | Default `2`                                           |
| `SOURCE_WATCH_SCAN_RETRY_BASE_DELAY_MS`          | Base retry delay for scans                   | Default `1000`                                        |
| `WIKI_ANALYZE_CONCURRENCY`                       | Analysis stage concurrency                   | Default `2`; constrained by Chat provider rate limits |
| `WIKI_GENERATE_CONCURRENCY`                      | Generation stage concurrency                 | Default `2`                                           |
| `WIKI_MERGE_CONCURRENCY`                         | Merge stage concurrency                      | Default `2`                                           |
| `COMPILE_MAX_CONTEXT_CHARS`                      | Compile prompt character budget              | Default `24000`; tune by model context                |
| `RETRIEVE_DEFAULT_TOP_K`                         | Default candidate count                      | Default `10`                                          |
| `RETRIEVE_MAX_TOP_K`                             | Max candidate count                          | Default `20`                                          |
| `RETRIEVE_DEFAULT_GRAPH_DEPTH`                   | Default graph depth                          | Default `1`                                           |
| `RETRIEVE_MAX_GRAPH_DEPTH`                       | Max graph depth                              | Default `3`                                           |
| `RETRIEVE_DEFAULT_GRAPH_LIMIT_PER_RESULT`        | Default graph expansion per result           | Default `5`                                           |
| `RETRIEVE_MAX_GRAPH_LIMIT_PER_RESULT`            | Max graph expansion per result               | Default `10`                                          |
| `RETRIEVE_DEFAULT_CONTEXT_BUDGET_TOKENS`         | Default context budget                       | Default `4000`                                        |
| `RETRIEVE_MAX_CONTEXT_BUDGET_TOKENS`             | Max context budget                           | Default `12000`                                       |
| `SOURCE_EVIDENCE_DEFAULT_MAX_CHARS`              | Default source evidence text cap             | Default `4000`                                        |
| `SOURCE_EVIDENCE_MAX_CHARS`                      | Max source evidence text cap                 | Default `12000`                                       |
| `SOURCE_EVIDENCE_DEFAULT_CONTEXT_CHARS`          | Default source evidence context              | Default `800`                                         |
| `SOURCE_EVIDENCE_MAX_CONTEXT_CHARS`              | Max source evidence context                  | Default `2000`                                        |
| `SOURCE_EVIDENCE_BATCH_MAX_ITEMS`                | Max batch evidence items                     | Default `20`                                          |
| `SOURCE_EVIDENCE_BATCH_TOTAL_OUTPUT_MAX_CHARS`   | Max batch evidence output                    | Default `40000`                                       |

## Webhooks

| Field                                  | Description                    | Recommended Value                                                      |
| -------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `FOCOCONTEXT_WEBHOOK_SECRET`           | Signing secret                 | Use a random value in production; leave empty when webhooks are unused |
| `WEBHOOK_DELIVERY_ENABLED`             | `true` / `false`               | Use `true` when event delivery is needed                               |
| `WEBHOOK_DELIVERY_TIMEOUT_SECONDS`     | Delivery timeout               | Default `10`                                                           |
| `WEBHOOK_DELIVERY_CONCURRENCY`         | Delivery concurrency           | Default `2`                                                            |
| `WEBHOOK_DELIVERY_MAX_RETRIES`         | Max retry count                | Default `3`                                                            |
| `WEBHOOK_DELIVERY_RETRY_BASE_DELAY_MS` | Base retry delay               | Default `1000`                                                         |
| `WEBHOOK_DELIVERY_RETRY_BACKOFF`       | `fixed` / `exponential`        | Use `exponential`                                                      |
| `WEBHOOK_SIGNING_TOLERANCE_SECONDS`    | Signature timestamp tolerance  | Default `300`                                                          |
| `WEBHOOK_DELIVERY_RETENTION_DAYS`      | Delivery record retention days | Default `30`                                                           |

## Production Filling Guide

- Local deployments can keep the default ports. Production should use reverse proxy and internal service addresses.
- Admin password, API Key, database password, S3 keys, model keys, and webhook secret should be random values.
- Do not mix system object storage `S3_*` with user source bucket `SOURCE_WATCH_S3_*`.
- Start with default concurrency values, then increase after observing CPU, memory, S3 bandwidth, and provider rate limits.
- Keep optional features disabled until basic ingest and Retrieve are verified.
