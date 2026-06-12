# Introduction

## Karpathy LLMWiki Design Philosophy

LLMWiki starts from a simple observation: long-lived knowledge deserves a durable surface. The LLM incrementally compiles sources into a persistent, growing, interlinked wiki. When a new source arrives, the system updates entity pages, concept pages, topic summaries, cross-references, and contradiction notes so knowledge compounds across every ingest.

The pattern has three core layers:

| Layer       | Role                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| Raw Sources | Immutable source material that remains the factual ground truth                               |
| Wiki        | LLM-maintained Markdown pages for summaries, entities, concepts, links, and synthesis         |
| Schema      | The structure, naming, linking, frontmatter, ingest, and answer rules that discipline the LLM |

The wiki is the durable asset. The LLM handles summarization, cross-references, updates, and consistency checks. Humans curate sources, ask questions, and steer the direction. With every ingest, query, and cleanup pass, the wiki becomes more complete, and retrieval can build on pages, links, indexes, and history that already exist.

## What FocoContext Is

FocoContext inherits the LLMWiki philosophy and turns it into a self-hosted knowledge service for developers. It compiles files, text, URLs, Source Watch results, and external submissions into durable Wiki Pages, graph relationships, citations, versions, and retrieval-ready context packs.

It is designed to sit beside your application backend, Agent service, or automation workflow as an independent knowledge middleware. Your product owns users, conversations, permissions, and final answers. FocoContext owns knowledge persistence, compilation, source traceability, retrieval context, and version history.

## Product Architecture

![FocoContext product architecture](/images/fococontext-product-architecture.png)

FocoContext is built around knowledge compilation. Sources enter through the same OpenAPI and job system, then move through parsing, OCR, Wiki compilation, and Change Set application before becoming canonical Wiki Pages, knowledge graph edges, source evidence, and version records.

Forks are the continuous update and isolated overlay mechanism in this architecture. Applications or agents can submit user-owned, workspace-owned, or customer-owned confirmed knowledge into a Fork overlay. Retrieval inside a Fork scope merges upstream canonical knowledge with the current Fork additions without polluting the canonical Knowledge Base.

Retrieval combines Wiki pages, lexical recall, semantic recall, Fork scope, and graph expansion into a traceable `context_pack`. This gives applications and agents stable knowledge objects, relationship explanations, isolated additions, and citation evidence while keeping upload, polling, retrieval, and operations available through a simple API surface.

## Standard Flow

### Step 1: Start the Service

Start API Server, Admin Web, Worker, PostgreSQL, Redis, and the bundled OCR service with the default Docker Compose template. Use the optional-OCR template when a constrained host should start without OCR.

### Step 2: Create a Knowledge Base

Create a Knowledge Base from Dashboard. Set name, slug, purpose, output language, and the initial schema. A Knowledge Base is the top-level dataset that owns sources, Wiki Pages, graph edges, versions, webhooks, and forks.

### Step 3: Import Sources

Upload files from Admin or submit files, text, URLs, and fork-owned submissions through OpenAPI. Each source stores original object metadata, parse output, media assets, and content hash.

### Step 4: Wait for Ingest Completion

An ingest job moves through parsing, analysis, generation, merge, indexing, and completion. Completion means Wiki Pages, system pages, graph, indexes, version records, and retrieval readiness have been updated.

### Step 5: Inspect Knowledge Assets

Open Wiki Pages, Graph View, Versions, and Knowledge Check. These surfaces show compiled durable knowledge, not raw source chunks.

### Step 6: Integrate Retrieve

Use Retrieval Lab to test a query, inspect candidate pages, citations, graph expansion, image caption hits, and `context_pack`. Once the result is acceptable, copy the same request shape into your backend.

## Responsibility Boundary

| Boundary         | FocoContext owns                                          | Your application owns                                                |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| User product     | Traceable retrieval context                               | Conversations, pages, business workflows, and final answers          |
| Knowledge assets | Wiki Pages, graph, citations, versions                    | Which sources belong to which Knowledge Base                         |
| Retrieval result | Candidates, citations, `context_pack`, graph explanations | Prompt assembly, business model calls, or Agent orchestration        |
| Permissions      | API Key, default admin account, resource existence checks | End-user identity, tenant permissions, and business authorization    |
| Updates          | Uploads, Source Watch, fork submissions, version records  | When to submit content and how to approve external generated content |

## When to Use Admin

Admin is for deployment checks, data inspection, operational troubleshooting, and knowledge-base operation.

| Page            | Common action                                                                   |
| --------------- | ------------------------------------------------------------------------------- |
| Dashboard       | Create Knowledge Bases and inspect overall status                               |
| Sources         | Upload files, inspect source status, preview deletion impact                    |
| Jobs            | Read stage events and retry failed jobs                                         |
| Wiki Pages      | Read compiled pages and source citations                                        |
| Graph View      | Inspect relationships, communities, bridge pages, and insights                  |
| Knowledge Check | Inspect isolated pages, broken links, missing sources, and duplicate candidates |
| Versions        | Inspect Change Sets, page versions, and rollback records                        |
| Retrieval Lab   | Validate Retrieve requests and context budgets                                  |
| Settings        | Inspect deployment config, model providers, storage, and runtime status         |

## When to Use OpenAPI

Production integrations should use OpenAPI. A typical server-side flow is:

```text
Create Knowledge Base -> Upload Source -> Poll Job -> Inspect Pages -> Retrieve -> Handle Webhook
```

If you integrate FocoContext into your SaaS, Agent service, or internal platform, store Knowledge Base IDs, API Keys, job IDs, and required resource IDs on your backend. Do not expose Bearer API Keys to browser clients.

## Production Notes

- Admin account, API Key, model keys, and S3 credentials should come from `.env` or your deployment secret manager.
- Original files and derived assets are stored in S3-compatible object storage. Deletions enter asynchronous cleanup.
- For Source Watch, run a manual scan and inspect scan history before enabling schedules.
- Large files, OCR, image captions, and model generation consume Worker capacity. Tune concurrency for your server.
- Admin UI language affects only the console. Knowledge Base output language is configured per Knowledge Base.
