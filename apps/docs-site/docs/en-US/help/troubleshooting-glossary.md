# Troubleshooting and Glossary

## Overview

Use this page to locate common issues quickly. Start with the symptom table, then open the relevant detailed page.

## Fast Debug Order

1. Settings: check API, Worker, PostgreSQL, Redis, S3, and model provider status.
2. Jobs: inspect latest failed job, failed stage, and `request_id`.
3. Sources: inspect Source status, parser warnings, and media assets.
4. Wiki Pages: confirm durable knowledge assets were generated.
5. Graph View: confirm graph index and insights exist.
6. Retrieval Lab: inspect candidates, citations, context budget, and diagnostics.

## Common Issues

| Symptom                          | Check first                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Sign-in says invalid credentials | Admin username/password in `.env` and whether containers restarted with latest config   |
| Knowledge Base creation fails    | slug format, required fields, API error toast                                           |
| Upload has no progress           | Browser request, S3 write, job creation                                                 |
| Job stuck in queued              | Worker health, Redis, queue concurrency                                                 |
| Job stuck in parsing             | File format, size limit, OCR service, parser logs                                       |
| Job stuck in analyzing           | Chat provider, provider rate limit, streaming config, `output_validation_failed` repair |
| Completed job but no Wiki Pages  | merge/index metadata, page list filters, version records                                |
| Graph is empty                   | Not enough relationships, Graph index status, graph build event                         |
| Retrieve returns no result       | Index readiness, Embedding provider, query language, context budget                     |
| Old deleted page still clickable | Resource state cache; Admin rechecks and blocks stale actions                           |
| Duplicate webhook events         | Process idempotently with event ID                                                      |

## Error Envelope

API errors use a structured envelope. Keep `request_id` for debugging.

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

Admin toast should show user-readable messages. Developers should inspect code, details, and request ID.

## Glossary

| Term              | Meaning                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| Knowledge Base    | Top-level knowledge dataset                                                 |
| Source Document   | Original evidence record                                                    |
| Parsed Content    | Structured content after parsing                                            |
| Media Asset       | Images, tables, attachments, and similar assets                             |
| Wiki Page         | Compiled durable knowledge page                                             |
| Graph Edge        | Relationship between pages                                                  |
| Knowledge Check   | Non-blocking quality finding                                                |
| Change Set        | A group of changes from one operation                                       |
| Knowledge Version | Whole Knowledge Base version                                                |
| Page Version      | Historical version of one page                                              |
| Fork              | Isolated user-owned or workspace-owned knowledge additions                  |
| Source Watch      | Rule that scans external source locations                                   |
| Retrieve          | API that returns candidates, citations, graph expansion, and `context_pack` |
| Context Budget    | Budget controlling returned context length                                  |
| CJK retrieval     | Lexical retrieval for Chinese, Japanese, Korean, and mixed-language content |

## What to Include When Reporting Issues

- Version or commit.
- Docker service status.
- `request_id` from failed API.
- Job ID, Source ID, Knowledge Base ID.
- Relevant container logs.
- Whether real S3, real model providers, OCR, or Vision are enabled.

## Production Notes

- Upload success means the original source reached storage. Ingest completion requires the linked job to complete.
- Knowledge Base completion requires Wiki Pages, graph, versions, indexes, and retrieval readiness.
- Fix configuration and job failures before tuning retrieval parameters.
- For large files, observe API health, Worker health, S3 bandwidth, and model latency separately.
