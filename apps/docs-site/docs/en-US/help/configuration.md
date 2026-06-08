# Configuration

## Overview

This page explains deployment-level configuration. Knowledge Base business settings belong in Knowledge Base settings. Database, queue, object storage, models, concurrency, and security values belong in `.env`.

## Configuration Model

FocoContext uses env-first configuration. This fits open-source self-hosting and container deployment, and keeps secrets out of Admin forms.

| Configuration                      | Recommended location | Admin display                                                |
| ---------------------------------- | -------------------- | ------------------------------------------------------------ |
| Admin account                      | `.env`               | Used for sign-in; password is never displayed                |
| Bearer API Key                     | `.env`               | Shows configured state and masked preview only               |
| PostgreSQL / Redis                 | `.env`               | Shows connection health                                      |
| S3-compatible storage              | `.env`               | Shows endpoint, bucket, and health                           |
| Chat / Embedding / Rerank / Vision | `.env`               | Shows provider, model, and availability                      |
| Worker concurrency and limits      | `.env`               | Shows current runtime values                                 |
| purpose, schema, retrieval budget  | Admin or OpenAPI     | Editable per Knowledge Base                                  |
| prompt templates                   | Admin or OpenAPI     | Editable per Knowledge Base; provider secrets stay in `.env` |

## Step 1: Configure Security Basics

Set at least admin credentials and OpenAPI Key:

```dotenv
FOCOCONTEXT_ADMIN_USERNAME=admin
FOCOCONTEXT_ADMIN_PASSWORD=change-me
FOCOCONTEXT_API_KEY=replace-with-a-long-random-token
```

Admin credentials are for the console. Bearer API Key is for external services calling OpenAPI. They are separate credentials.

## Step 2: Configure Database and Queue

```dotenv
DATABASE_URL=postgres://...
REDIS_URL=redis://...
```

PostgreSQL stores business data, versions, pages, relationships, and job records. Redis powers BullMQ queues, short-lived state, and Worker coordination.

| Component  | Failure symptom                            | Where to inspect                   |
| ---------- | ------------------------------------------ | ---------------------------------- |
| PostgreSQL | Lists fail to load or migrations fail      | Container logs and Settings health |
| Redis      | Jobs stay queued or Workers stop consuming | Worker logs and queue health       |

## Step 3: Configure S3-compatible Storage

Original files, parsed outputs, images, caption inputs and outputs, and export packages are stored in object storage.

```dotenv
S3_ENDPOINT=https://s3.example.com
S3_BUCKET=fococontext
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

FocoContext reports S3-compatible operation volume with provider-neutral Class A and Class B groups. Use `S3_OPERATION_*` thresholds for pressure warnings, `S3_PREVIEW_*` to avoid repeated full markdown reads for previews, `S3_MULTIPART_PART_SIZE_BYTES` to tune multipart request count, and `SOURCE_WATCH_S3_INCREMENTAL_SCAN_ENABLED=true` to avoid downloading unchanged Source Watch S3 objects. Exact prices and billing names remain provider-specific.

Object keys include resource IDs and random suffixes to avoid filename collisions. Admin shows original filenames while the backend keeps object key mappings for asynchronous cleanup.

## Step 4: Configure Model Providers

Model providers use OpenAI-compatible interfaces. Chat, Embedding, Rerank, and Vision are configured separately.

| Provider  | Use                                                   |
| --------- | ----------------------------------------------------- |
| Chat      | Analyze sources, generate Wiki Pages, merge summaries |
| Embedding | Build semantic indexes                                |
| Rerank    | Reorder candidate results                             |
| Vision    | Image captions and visual understanding support       |

Common settings include base URL, API key, model name, timeout, retry, streaming flag, and concurrency limits. Validate each provider with a small file before production import.

## Step 5: Configure Dataset Prompt Templates

Prompt templates are Knowledge Base business configuration. They control how FocoContext asks configured models to analyze sources, generate Wiki pages, merge changes, caption images, run Knowledge Check, and compile Wiki Draft submissions.

Open **Knowledge Base Settings → Prompt templates**. Choose a prompt purpose, review the built-in prompt, then choose one of three modes:

| Mode                  | Use case                                                       | Safety behavior                                                                          |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `built_in`            | Use the shipped prompt exactly                                 | No admin text is added                                                                   |
| `custom_instructions` | Add domain terms, style rules, or formatting preferences       | Locked source-traceability and output contracts are preserved                            |
| `override_template`   | Replace the editable template body in a self-hosted deployment | API validates required source, evidence, schema, and output-contract terms before saving |

Use custom instructions for normal production tuning. Use override mode only when you can test the full ingest flow because invalid prompt output can break structured analysis or generation.

| Purpose           | Runtime stage                                   |
| ----------------- | ----------------------------------------------- |
| `analysis`        | Source analysis and knowledge object extraction |
| `generation`      | Wiki draft generation from analyzed content     |
| `merge`           | Page merge and version application summaries    |
| `vision_caption`  | Image caption generation for extracted media    |
| `knowledge_check` | Semantic Knowledge Check findings               |
| `wiki_draft`      | Developer-submitted Wiki Draft compilation      |

Every saved prompt change creates a new dataset configuration version and snapshot. Jobs resolve prompts at job start from that snapshot, so running jobs keep their original prompt snapshot. Model-call and job metadata store the prompt purpose, mode, built-in prompt id, effective prompt version, effective prompt hash, and dataset configuration snapshot id. Public Retrieve responses omit the full effective prompt text.

## Step 6: Configure Runtime Concurrency

Production concurrency should match CPU, memory, provider rate limits, OCR cost, and S3 bandwidth.

| Concurrency value          | Impact                                        |
| -------------------------- | --------------------------------------------- |
| ingest worker concurrency  | Number of ingest jobs processed at once       |
| parser concurrency         | Number of files parsed at once                |
| OCR concurrency            | Number of OCR pages or jobs processed at once |
| vision caption concurrency | Number of images captioned at once            |
| model request concurrency  | Number of model requests in flight            |
| source watch concurrency   | Number of rules scanned at once               |

Start conservatively, observe latency and rate limits, then increase gradually.

## Step 7: Verify in Admin

Open Settings and confirm:

1. Runtime status is healthy.
2. Database and queue are reachable.
3. S3 bucket can be written and read.
4. Model provider and model names are visible.
5. Worker concurrency values match `.env`.
6. Prompt template previews save and validate inside Knowledge Base Settings.
7. OpenAPI base URL and CORS match the deployment.

## Production Notes

- Keep `.env` on the server and out of Git.
- Use a reverse proxy for HTTPS, domain routing, request size, and access control.
- Store API Keys server-side only.
- After changing models or concurrency, restart Workers and validate ingest with a small file.
- When changing S3 buckets, clean or intentionally retain old objects.
