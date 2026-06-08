# Retrieval Lab

## Overview

Retrieval Lab turns inspected knowledge assets into copyable Retrieve requests for backend developers and Agent integrations.

## Step 1: Select Knowledge Base

Select a Knowledge Base whose latest ingest completed and whose retrieve readiness is ready. Incomplete Knowledge Bases may return empty results.

Check:

| Check           | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| latest version  | Knowledge version used for retrieval                         |
| source count    | At least one completed source exists                         |
| graph index     | Graph expansion is available when graph index is ready       |
| embedding index | Semantic recall needs embedding index                        |
| language        | Query language matches the Knowledge Base output and content |

## Step 2: Enter Query

Use realistic business questions with an object, action, or constraint.

| Query type      | Example                                                 |
| --------------- | ------------------------------------------------------- |
| Concept         | “What is the ingest flow for this system?”              |
| Relationship    | “Which modules affect Source Watch scan results?”       |
| Troubleshooting | “What should I check when a job is stuck in analyzing?” |
| Source tracing  | “Which sources support this configuration advice?”      |

## Step 3: Set Retrieval Parameters

| Parameter         | Use                                                   |
| ----------------- | ----------------------------------------------------- |
| topK              | Number of candidate pages                             |
| graph expansion   | Whether to expand along graph relationships           |
| rerank            | Whether to reorder candidates                         |
| context budget    | Token or character budget for final `context_pack`    |
| include citations | Whether to return citations and locators              |
| include media     | Whether image captions and media sources are included |
| fork scope        | Whether retrieval runs inside a Fork                  |

Start with defaults. After recall looks correct, tune budget and graph expansion.

## Step 4: Read Result

Inspect response sections in order:

| Section         | How to judge                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| answerability   | Check whether context is `answerable`, `partial`, or `not_answerable` before using candidates for an Agent response |
| candidates      | Candidate pages should match the question                                                                           |
| citations       | Citations should trace back to Source Documents                                                                     |
| graph expansion | Expanded pages should have explanations and not grow randomly                                                       |
| media hits      | Image captions should link to original image and source page                                                        |
| context_pack    | Should be directly usable by your upstream model                                                                    |
| diagnostics     | Budget truncation, rerank, CJK, or mixed-language retrieval details                                                 |

If candidates are correct but `context_pack` is too short, increase context budget. If candidates are wrong, inspect page titles, summaries, keywords, graph relationships, and embedding status.

When `include_trace` is enabled, inspect these safe diagnostics:

| Trace or response field                   | What to check                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trace.stages[name=metadata_matching]`    | Source name, source path, source summary, slug, and metadata match counts                                                                                                       |
| `trace.stages[name=rank_fusion]`          | Lexical count, semantic count, fused count, and duplicate-control summary                                                                                                       |
| `trace.stages[name=rerank].output.status` | `disabled`, `skipped`, `applied`, `failed`, or `timed_out`                                                                                                                      |
| `trace.stages[name=answerability]`        | Confidence contribution summary, thresholds, reason codes, and recommended action                                                                                               |
| `answerability.no_answer`                 | When true, returned candidates are diagnostic and need stronger evidence before an Agent uses them                                                                              |
| `trace.stages[name=context_pruning]`      | Omitted context counts, reason counts, and truncated categories                                                                                                                 |
| `warnings`                                | Request-level warning codes such as `retrieve.rerank_failed`                                                                                                                    |
| `context_budget.omitted_items[].reason`   | Explains context omissions, including budget exhaustion, duplicate context/source noise, graph neighbors kept for expansion, lower source matches, and missing locator evidence |
| `context_pack.entries`                    | Final prompt-ready items selected after ranking, graph expansion, and pruning                                                                                                   |

## Step 5: Copy Request

After validation, copy the request into your server. Do not store Bearer API Keys in browser clients.

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/retrieve" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query":"What should I check when ingest is stuck?","top_k":5}'
```

## Troubleshooting

| Symptom                  | Possible cause                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| No result                | Ingest not completed, indexes not ready, language mismatch                                               |
| Semantic index warning   | `retrieve.index.semantic_not_ready` means lexical and graph may still run while embedding index is empty |
| Missing citations        | Page lacks sources, source was deleted, parser locator incomplete                                        |
| Too much graph expansion | Graph expansion or community parameters too broad                                                        |
| Poor Chinese recall      | Check CJK lexical retrieval, title, synonyms, and mixed-language content                                 |
| Truncated context_pack   | context budget too small or candidate content too long                                                   |
| Rerank not applied       | Check empty `RERANK_*` env, trace rerank status, timeout, and warnings                                   |
| Duplicate context        | Inspect `duplicate_context` and `duplicate_source_noise` omissions before increasing `topK`              |

## Production Notes

- Retrieve is a backend API for developers. Your application remains responsible for final end-user answers.
- If `answerability.no_answer` is true, ask a clarifying question, relax filters, wait for ingest readiness, or refuse unsupported claims.
- If `answerability.status` is `partial`, answer with caveats only when citations and context are adequate for the stated scope.
- Your application should log query, request ID, citations, and final answer for debugging.
- With webhooks, refresh business-side caches after ingest completion events.
