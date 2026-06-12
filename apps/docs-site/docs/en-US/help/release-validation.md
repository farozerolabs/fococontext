# Release Validation

## Overview

Release validation proves that FocoContext works from two angles before a release is promoted.

White-box validation checks code-level contracts: API route behavior, repository queries, migrations, queue state, runtime configuration, source ingest, retrieval contracts, source evidence, tenant isolation, cleanup, security controls, and Admin UI behavior.

Black-box validation starts the Docker Compose runtime and uses the product like a developer and an operator: public OpenAPI, Admin Web, PostgreSQL, Redis, S3-compatible storage, OCR, API, Worker, and migrations.

## Validation Commands

Install dependencies first:

```bash
pnpm install
```

Run the report contract self-test:

```bash
pnpm run validation:report-contract
```

Run the white-box path:

```bash
pnpm run validation:white-box -- --env .env
```

Run the full release validation path:

```bash
pnpm run validation:release -- --env .env
```

The full path can upload representative documents, poll ingest jobs, run Retrieve, run Retrieve Expand, resolve source evidence, open Admin Web in a browser, and clean up the temporary Knowledge Base.

## Representative Documents

The default sample is intentionally small.

| Source                                                 | Default role                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `/Users/gaobohan/Desktop/documents-test`               | General file shapes such as Markdown, PDF, Office, tables, and text |
| `local-knowledge-demos/legal-corpus/official-flk-sync` | Cleaned legal Markdown samples                                      |

Full-corpus validation is not the default path. Large or expensive runs need an explicit opt-in and should record expected runtime, provider dependencies, and cost risk before they start.

## Report Output

Reports are written under `test-results/whitebox-blackbox-validation` unless `FOCOCONTEXT_VALIDATION_REPORT_DIR` or `--report-dir` overrides the path. The directory is local validation output and is not committed.

Each run writes:

| File              | Purpose                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `report.json`     | Machine-readable run metadata, metrics, endpoint coverage, selected files, findings, and release gate state |
| `summary.md`      | Human-readable release review summary                                                                       |
| Admin screenshots | Browser evidence for key Admin Web flows when Admin validation is enabled                                   |

The report redacts API Keys, passwords, provider secrets, private object URLs, and sensitive payloads.

## Pass Criteria

A release validation run is ready only when:

- Required white-box checks pass.
- Docker Compose config, migrations, API, Worker, OCR, PostgreSQL, Redis, and object storage checks pass for the selected runtime.
- Authenticated public OpenAPI upload, job polling, Retrieve, Retrieve Expand, Source Evidence, and cleanup pass.
- Unauthorized OpenAPI and OpenAPI JSON requests are rejected.
- Admin Web session flows pass without exposing API Keys to browser storage.
- The report contract passes.
- Any accepted residual risk is written clearly in the report.

When a product defect blocks validation, fix the defect, rerun the affected path, then run the full final validation again.
