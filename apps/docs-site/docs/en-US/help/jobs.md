# Jobs

## Overview

Jobs show asynchronous processing. Uploads, Source Watch, deletion cleanup, caption retry, and user-facing indexing actions can produce jobs or job events. Graph Insights refresh status appears in Graph View.

## Step 1: Read the Jobs List

Jobs render as a table-style list with headers and are sorted by newest update first.

| Column         | Meaning                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Job            | Job name and Ingest Job ID for debugging                                                         |
| Knowledge Base | Owning Knowledge Base                                                                            |
| Source         | Linked Source                                                                                    |
| Status         | queued, running, completed, failed, canceled                                                     |
| Current stage  | A single localized state such as parsing, analyzing, generating, merging, indexing, or completed |
| Progress       | Current progress; only completed jobs show 100%                                                  |
| Updated at     | Latest event time                                                                                |
| Actions        | Details, retry, and cancel when the job status allows them                                       |

## Step 2: Open Job Detail

Use the Details action on a job row to inspect deeper diagnostics. Details are opened only for the selected row, so the default Jobs page remains a progress list.

| Section  | Use                                                                     |
| -------- | ----------------------------------------------------------------------- |
| Summary  | Job ID, Knowledge Base ID, Source ID, Change Set, status, creation time |
| Timeline | Newest event first, older events below                                  |
| Metadata | parser cache, model call, analysis result, version, index data          |
| Actions  | Copy IDs, retry failed jobs, navigate to linked resources               |

## Step 3: Understand Stages

| Stage      | Output after success                                               |
| ---------- | ------------------------------------------------------------------ |
| parsing    | parsed content, media assets, parser warnings                      |
| analyzing  | entities, concepts, relationships, source summary                  |
| generating | Wiki draft pages and system page updates                           |
| merging    | Page versions, Change Set, merge records                           |
| indexing   | full-text index, embedding index, graph index, retrieval readiness |
| completed  | Job is complete and usable for Retrieve                            |

Historical events are displayed as completed after the job completes. They remain in the timeline for traceability.

## Step 4: Handle Failures

Do not stop at the list state. Open detail and inspect the failed stage.

| Failed stage | Common causes                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| parsing      | corrupt file, unsupported format, OCR unavailable, parser timeout                                                                    |
| analyzing    | Chat provider misconfiguration, model rate limit, missing analysis collection contract, or `output_validation_failed` repair failure |
| generating   | invalid model output, missing `drafts` contract, or context too long                                                                 |
| merging      | page conflict, version write failure, database constraint error                                                                      |
| indexing     | Embedding provider failure, pgvector or full-text index error                                                                        |
| cleanup      | S3 delete failure or still-referenced data                                                                                           |

After fixing configuration or data, retry. Retry should keep the same source and append new job events.

## Step 5: Interpret Progress

Progress helps users understand movement. Production integrations should rely on job status and stage events.

| Progress | Typical stage    |
| -------- | ---------------- |
| 0-10%    | queued / parsing |
| 20-40%   | analyzing        |
| 45-65%   | generating       |
| 70-85%   | merging          |
| 90-99%   | indexing         |
| 100%     | completed        |

Failed jobs should keep progress near the failed stage and display a failed terminal state.

## API Integration Tips

For polling:

1. Call `GET /v1/jobs/<job_id>`.
2. Use `status` for terminal state.
3. Display the latest stage event.
4. Keep `request_id` and error code on failure.
5. Reduce polling frequency when webhooks are configured.

For failed compile stages, inspect `error.category` when present. `output_validation_failed` means the model response could not be normalized or repaired into the required structured schema. For analysis failures, first check that the effective prompt includes the top-level `entities`, `concepts`, `claims`, `contradictions`, and `relationships` array contract. If the job continues with `structured_output_final_status=source_backed_fallback`, analysis recovered from Parsed Content with source traceability and without model-inferred relationships. For generation failures, first check that the effective prompt includes the strict top-level non-empty `drafts` array contract, then check the selected model and source size before retrying.

## Production Notes

- Job timelines are debugging evidence and should be retained for operations.
- Large-file jobs can take longer; observe API health and Worker health separately.
- When deleting resources, related running jobs should be canceled or prevented from writing stale data.
- If many jobs fail together, check model, S3, database, and Redis configuration first.
