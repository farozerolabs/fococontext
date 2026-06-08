# Wiki Pages, Graph View, and Versions

## Overview

This page explains how to inspect durable knowledge after ingest. Sources are evidence. Wiki Pages, Graph View, Knowledge Check, and version records are the knowledge outputs.

## Step 1: Inspect Wiki Pages

Open Wiki Pages and select a page to view details.

| Area      | Meaning                                                |
| --------- | ------------------------------------------------------ |
| Page tree | Browse by type, title, and updated time                |
| Page body | Render Markdown, frontmatter, citations, and wikilinks |
| Sources   | Show Source Documents supporting the page              |
| Media     | Show images, captions, source page, and preview        |
| Versions  | Inspect page history and diffs                         |

If page content looks wrong, inspect source citations first, then analyze and generate events in the job timeline.

## Step 2: Use Graph View

Graph View explains page relationships. It should occupy the main visual area and support selection, drill-down, drill-up, and detail inspection.

| Action              | Result                                                |
| ------------------- | ----------------------------------------------------- |
| Click node          | Show page detail, sources, and relationships          |
| Click edge          | Show relationship type, weight, and evidence          |
| Click graph insight | Highlight related nodes or edges and show explanation |
| Drill down          | Focus on a community, topic, or entity neighborhood   |
| Drill up            | Return to a higher-level Knowledge Base view          |

Graph relationships come from wikilinks, shared sources, common neighbors, type affinity, generated evidence relationships, and community detection. Vector similarity can support retrieval, while graph structure explains durable relationships.

## Step 3: Read Graph Insights

Graph insights reveal structural problems and opportunities.

| Insight          | Meaning                                  |
| ---------------- | ---------------------------------------- |
| isolated pages   | Pages with too few useful relationships  |
| bridge pages     | Pages connecting multiple topic areas    |
| communities      | Groups of strongly related pages         |
| unexpected links | Cross-topic relationships worth checking |
| source clusters  | Pages sharing the same evidence sources  |
| missing links    | Relationships that may be absent         |

Clicking an insight card should update Graph View so the administrator can see the exact nodes and edges.

## Step 4: Handle Knowledge Check

Knowledge Check is a quality signal, not an approval flow. Common actions:

| Type                | Suggested action                                 |
| ------------------- | ------------------------------------------------ |
| Missing source      | Upload more evidence or fix page citations       |
| Broken link         | Create target page or adjust schema              |
| Duplicate candidate | Decide whether to merge pages or add aliases     |
| Conflict candidate  | Inspect evidence and add clarification           |
| Weak retrieval      | Adjust title, summary, tags, or retrieval config |

After handling findings, validate effects through Versions and Retrieval Lab.

## Step 5: Inspect Versions and Diff

Versions show Knowledge Base and page-level changes.

| Object            | Use                                                     |
| ----------------- | ------------------------------------------------------- |
| Knowledge Version | Whole Knowledge Base state                              |
| Change Set        | Changes produced by one operation                       |
| Page Version      | History of one page                                     |
| Diff              | Compare Markdown, frontmatter, and sources before/after |
| Rollback          | Restore to a recoverable state                          |

Rollback creates a new record and keeps history intact.

## Production Notes

- If Wiki Pages are missing, first check whether the linked job completed.
- If graph is empty, check page relationships, Graph index status, and job metadata.
- If retrieval quality is poor, inspect title, summary, citations, and context budget before blaming the model.
- After source deletion, affected pages and graph data should change through asynchronous cleanup or later versions.
