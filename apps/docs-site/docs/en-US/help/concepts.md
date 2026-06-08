# Key Concepts

## Overview

This page explains the objects that appear across Admin and OpenAPI. Read it before the workflow pages so you can tell whether an issue belongs to sources, compilation, durable knowledge, versions, or retrieval.

| Concept              | Main Admin pages              | Common API use                                                        |
| -------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Knowledge Base       | Dashboard, Settings, Versions | Create a dataset, save config, call Retrieve                          |
| Source Document      | Sources, Jobs                 | Upload files, submit text, delete evidence                            |
| Ingest Job           | Jobs, Source detail           | Poll progress and retry failures                                      |
| Wiki Page            | Wiki Pages, Graph View        | Read durable knowledge and export Markdown                            |
| Graph Edge           | Graph View                    | Explain relationships and multi-hop expansion                         |
| Knowledge Check      | Knowledge Check               | Inspect missing sources, broken links, duplicates, and isolated pages |
| Version / Change Set | Versions                      | Compare, roll back, and trace knowledge changes                       |
| Fork                 | fork-owned submissions        | Isolate user-owned or workspace-owned additions                       |

## Knowledge Base

A Knowledge Base is the top-level dataset. It owns sources, parsed content, Wiki Pages, graph edges, retrieval indexes, Knowledge Check findings, versions, webhooks, and forks.

Key fields:

| Field           | Meaning                                                             |
| --------------- | ------------------------------------------------------------------- |
| name            | Display name for administrators                                     |
| slug            | Stable short identifier for URLs, scripts, and debugging            |
| purpose         | Knowledge goal that influences generation and retrieval style       |
| output language | Language used for generated Wiki Pages and system pages             |
| schema          | Page types, fields, naming, links, and Markdown contract            |
| retrieve config | topK, graph expansion, rerank, context budget, and retrieval policy |

Store the Knowledge Base ID in your application database. Use name and slug for display and debugging, not as the only integration key.

## Source Document

A Source Document is evidence. It can come from Admin upload, OpenAPI text submission, URL import, Source Watch scan, or fork-owned submission.

Sources store:

- Original filename and MIME type.
- S3 object key and content hash.
- Archive path or virtual directory.
- Parser name, version, warnings, and traceable locators.
- Media assets such as images, tables, and attachments.
- Latest ingest job and cleanup state.

A Source is evidence input. It provides citations and replayable material. Retrieval works on compiled Wiki Pages and page segments.

## Ingest Job

An Ingest Job is the asynchronous processing record. Jobs and Sources both show the current stage.

| Stage      | What happens                                                              |
| ---------- | ------------------------------------------------------------------------- |
| queued     | The job waits for a Worker                                                |
| parsing    | The parser extracts text, tables, images, and locators                    |
| analyzing  | The model identifies entities, concepts, relationships, and summaries     |
| generating | Wiki draft pages and system page updates are generated                    |
| merging    | Drafts merge into existing pages and create Change Sets and page versions |
| indexing   | Full-text, vector, graph indexes, and retrieval readiness are updated     |
| completed  | The compile flow is complete and ready for Retrieve                       |
| failed     | A stage failed and keeps error, stage, and retry metadata                 |

The timeline is historical. Newest events appear first. Each event carries status, timestamp, message, and metadata for debugging models, parsers, indexing, or storage.

## Wiki Page

A Wiki Page is the durable knowledge surface. It contains Markdown, frontmatter, source citations, related pages, versions, and export contract data.

Common page types:

| Type           | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| source summary | Summarizes a source and its evidence                                |
| entity         | Stable object such as person, organization, product, API, or module |
| concept        | Concept, process, policy, or issue type                             |
| overview       | Knowledge Base overview                                             |
| index          | Navigation and directory entry                                      |
| changelog      | Knowledge change log                                                |

Retrieve is centered on Wiki Pages. This keeps knowledge maintainable and lets the same concept from multiple sources converge into one durable object.

## Graph View

Graph View shows relationships between pages. Edges come from wikilinks, shared sources, common neighbors, type affinity, generated evidence relationships, and community detection.

| Graph data  | Use                                                                 |
| ----------- | ------------------------------------------------------------------- |
| Node        | Wiki Page, Source Summary, or system page                           |
| Edge        | Page relationship, shared source, type affinity, citation evidence  |
| Community   | A strongly related group of pages                                   |
| Bridge page | A page that connects multiple topic areas                           |
| Insight     | Isolated pages, unexpected links, gaps, and important relationships |

Graph explains and expands retrieval while source citations remain the evidence boundary.

## Knowledge Check

Knowledge Check findings are non-blocking quality signals.

| Finding             | Meaning                                       |
| ------------------- | --------------------------------------------- |
| isolated page       | A page has too few useful relationships       |
| broken link         | Markdown or graph contains a missing target   |
| missing source      | A page lacks traceable evidence               |
| duplicate candidate | Multiple pages may describe the same object   |
| conflict candidate  | New evidence may conflict with existing pages |
| weak retrieval      | A page has poor retrieval visibility          |

Findings are non-blocking quality signals. Administrators use evidence to decide whether to add sources, adjust schema, or delete incorrect evidence.

## Versions, Change Sets, and Rollback

Every knowledge mutation should be traceable. Version history answers:

1. Which pages changed.
2. Which source or operation caused the change.
3. Which state can be restored if rollback is needed.

The version model keeps Git-like traceability without forcing manual approval for every ingest. Compile results are applied automatically and remain comparable and rollbackable.

## Fork

Forks isolate user-owned or workspace-owned knowledge additions. They are useful for multi-user products: each end user can build on a shared upstream Knowledge Base without polluting canonical data.

Forks store isolated submissions and version relationships. The external application decides when to collect user content, when to call the fork submission API, and when to retrieve with fork scope.
