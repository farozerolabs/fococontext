# Sources and Ingest

## Overview

This page explains Sources and the upload dialog. A Source is evidence. Compiled Wiki Pages are the durable knowledge assets.

## Step 1: Choose an Import Method

| Method          | Best for                                               | Entry              |
| --------------- | ------------------------------------------------------ | ------------------ |
| File upload     | Manual PDF, DOCX, Markdown, spreadsheet import         | Admin Sources      |
| Text submission | Developer-submitted confirmed content                  | OpenAPI            |
| URL submission  | Server-side import of a page or remote file            | OpenAPI            |
| Source Watch    | Scheduled scans for directories, S3, URL lists, or Git | Admin Source Watch |
| Fork submission | User-owned or workspace-owned isolated additions       | OpenAPI            |

## Step 2: Upload Files

Click Upload sources in Sources. The dialog shows file list, progress, and status for each file.

Optional fields:

| Field                            | Meaning                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive path / virtual directory | Logical grouping such as `policies/2026/`                                                                                                                      |
| Metadata labels                  | Trace and filter values such as `department=operations` or `source=manual`                                                                                     |
| Knowledge Base                   | Target Knowledge Base for the file                                                                                                                             |
| Upload mode                      | Automatic keeps the runtime threshold policy; Built-in upload forces the Admin multipart API; Direct upload uses upload sessions when runtime storage is ready |

After upload, the backend creates a Source Document and writes the original file to S3-compatible storage. Object keys include resource IDs and random suffixes to avoid collisions when filenames repeat.

Upload mode changes only the transport used for the original file. Ingest queueing, parsing, Wiki generation, graph updates, indexing, and version creation still run.

Direct upload readiness is reported by runtime status at `limits.upload.directUpload.ready`.
Use that canonical field from `/health` or System Settings before routing large
files to upload sessions.

## Step 3: Understand Supported Formats

| Type                    | Processing                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| Markdown / text         | Extracts structure and body directly                                       |
| PDF                     | Extracts text, pages, and images; OCR can help low-text or scanned content |
| DOCX / PPTX / XLSX      | Converts to structured Markdown, tables, and media assets                  |
| CSV / JSON / YAML / XML | Preserves structure and converts into analyzable text                      |
| HTML                    | Extracts body, links, and heading structure                                |
| Images                  | Stored as media assets; optional captions can be generated                 |

The parser outputs normalized Markdown, plain text, locators, tables, warnings, and media assets. Parser warnings are not always failures. Check job status and stage events.

## Step 4: Read the Sources List

Sources are sorted by newest update first, aligned with Jobs. Focus on:

| Column        | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| Name          | Original filename or submitted title                                |
| ID            | Source Document ID for API debugging                                |
| Status        | queued, processing, completed, failed, deleting, and related states |
| Current stage | Latest job stage                                                    |
| Updated at    | Latest upload, processing, or cleanup time                          |
| Latest job    | Linked Ingest Job                                                   |

Select a source to inspect metadata, parse output, media assets, caption state, job timeline, and deletion impact.

## Step 5: Wait for Compilation

Upload completion only means the original file is in object storage. The linked job must complete before Wiki Pages, graph, indexes, and versions are updated.

If a job fails:

1. Open job detail.
2. Read failed stage and error message.
3. Check model, parser, OCR, S3, or indexing configuration.
4. Fix the cause and retry.

## Step 6: Delete Sources

Preview deletion impact first. The preview shows affected pages, indexes, graph edges, versions, and object storage resources.

After deletion, Admin hides the source from normal lists and starts asynchronous cascade cleanup. Related running jobs are canceled or prevented from writing stale data back.

## Production Notes

- For large files, prefer Direct upload when `limits.upload.directUpload.ready` is `true`; use Automatic for mixed batches when file sizes vary.
- Repeated filenames keep separate S3 objects. Admin still shows original filenames.
- Image caption failure should stay isolated from text ingest; retry captions separately.
- For scanned PDFs, validate OCR service and concurrency before batch import.
- Treat Source as evidence input. Retrieve is centered on Wiki Pages.
