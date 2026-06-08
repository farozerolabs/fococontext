# Knowledge Base workflow

## Overview

This page explains how to create and operate a Knowledge Base in Admin. For OpenAPI creation, see the OpenAPI documentation. This page focuses on console operations and configuration meaning.

## Step 1: Create a Knowledge Base

From Dashboard, click New knowledge base and fill in:

| Field           | Meaning                      | Recommendation                                        |
| --------------- | ---------------------------- | ----------------------------------------------------- |
| Name            | Admin display name           | Use a business or dataset name                        |
| slug            | Stable short identifier      | Use lowercase letters, numbers, and hyphens           |
| purpose         | Knowledge goal               | Describe audience, use case, domain, and output style |
| Output language | Language for Wiki generation | Match source language or end-user language            |
| schema          | Page types and fields        | Keep defaults for the first run                       |

After creation, copy the Knowledge Base ID. Uploads, Retrieve, webhooks, and automation scripts use it.

## Step 2: Inspect Overview

Overview answers three operational questions:

1. Whether the current version is ready for retrieval.
2. Which recent sources and jobs changed it.
3. Which pages, graph insights, quality findings, and versions need attention.

| Metric             | Meaning                                      |
| ------------------ | -------------------------------------------- |
| retrieve readiness | Whether Retrieve can use this Knowledge Base |
| latest version     | Latest knowledge version                     |
| source count       | Number of linked sources                     |
| job status         | Recent ingest job state                      |
| graph status       | Graph index and insights availability        |
| check findings     | Knowledge Check findings to inspect          |

## Step 3: Configure Business Rules

Open Knowledge Base settings and adjust:

| Setting           | When to change                                                    |
| ----------------- | ----------------------------------------------------------------- |
| purpose           | Generated output misses the business goal                         |
| schema            | Page types, fields, or naming rules need changes                  |
| output language   | Wiki output language should change                                |
| retrieval budget  | Retrieve result is too long or too short                          |
| graph expansion   | More or less graph expansion is needed                            |
| Markdown contract | You need export compatibility with an external Wiki or repository |

Avoid frequent schema or output-language changes while many ingest jobs are running. Adjust after the current batch completes.

## Step 4: Import Sources

Import sources through Sources, OpenAPI, or Source Watch. Every source eventually creates or links to an Ingest Job.

Recommended first run:

1. Upload one small file.
2. Wait for completion.
3. Inspect Wiki Pages and Graph View.
4. Validate Retrieve in Retrieval Lab.
5. Then batch upload or enable Source Watch.

## Step 5: Inspect Versions

Every ingest, deletion, rollback, or external submission creates version records. Versions show:

| Item              | Use                                        |
| ----------------- | ------------------------------------------ |
| Knowledge Version | Whole Knowledge Base version               |
| Change Set        | Pages and sources changed by one operation |
| Page Version      | History for a single page                  |
| Diff              | Before/after differences                   |
| Rollback Record   | Rollback operation and result              |

Versions provide auditability without requiring manual approval for every ingest.

## Step 6: Delete a Knowledge Base

Deleting a Knowledge Base is dangerous. Admin hides it from normal lists immediately and blocks further operations. Actual cleanup runs asynchronously across database records, S3 objects, indexes, and job state.

Before deletion:

- Export Markdown you want to keep.
- Confirm no production service still calls this Knowledge Base ID.
- Check for running jobs.
- Ensure webhook consumers handle deletion or unavailable errors.

## Troubleshooting

| Problem                                 | Action                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| Invalid slug                            | Use lowercase letters, numbers, and hyphens                           |
| List stays stale                        | Refresh Dashboard or inspect API error toast                          |
| Knowledge Base is not retrievable       | Confirm at least one job completed and indexes are ready              |
| Old page still clickable after deletion | Admin rechecks resource state and redirects away                      |
| API returns not found                   | Resource may be deleted or cleaning up; inspect `request_id` and logs |
