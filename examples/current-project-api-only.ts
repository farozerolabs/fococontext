interface FococontextConfig {
  baseUrl: string;
  apiKey: string;
  knowledgeBaseId?: string;
  sourceWatchLocation?: string;
}

interface Envelope<TData> {
  data: TData;
  request_id: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
}

interface SourceDocument {
  id: string;
}

interface IngestJob {
  id: string;
  status: string;
}

interface DocumentUploadResponse {
  document: SourceDocument;
  job: IngestJob;
  links: Array<{
    href: string;
    method: string;
    rel: string;
    resource_type: string;
  }>;
  resources: {
    knowledge_base_id: string;
    source_document_id: string;
    job_id: string;
  };
}

interface BatchIngestJobStatusResponse {
  items: Array<{
    job?: IngestJob;
    job_id: string;
    status: string;
  }>;
}

interface KnowledgeBaseIngestProgress {
  counts: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    queued: number;
    canceled: number;
  };
  overall_progress: number;
  retrieve_ready: boolean;
}

interface RetrieveResult {
  page_id: string;
  title: string;
  media_evidence?: Array<{
    media_asset_id: string;
    preview: {
      available: boolean;
      endpoint: string;
    };
  }>;
}

interface RetrieveResponse {
  results: RetrieveResult[];
  context_budget?: Record<string, unknown>;
  context_pack?: {
    markdown?: string;
  };
  resolved_evidence?: {
    items?: unknown[];
  };
}

interface RetrieveExpandResponse {
  expanded_results?: RetrieveResult[];
}

interface SourceWatchRule {
  id: string;
}

interface SourceWatchScanHistory {
  items: Array<{
    id: string;
    status: string;
    trigger_type: string;
  }>;
}

export function readFococontextConfig(env: NodeJS.ProcessEnv = process.env): FococontextConfig {
  return {
    baseUrl: readRequiredEnv(env, "FOCOCONTEXT_BASE_URL").replace(/\/$/, ""),
    apiKey: readRequiredEnv(env, "FOCOCONTEXT_API_KEY"),
    knowledgeBaseId: env.FOCOCONTEXT_KNOWLEDGE_BASE_ID,
    sourceWatchLocation: env.FOCOCONTEXT_SOURCE_WATCH_LOCATION,
  };
}

export async function runCurrentProjectWorkflow(
  config: FococontextConfig = readFococontextConfig(),
): Promise<void> {
  const knowledgeBaseId =
    config.knowledgeBaseId ??
    (
      await postJson<KnowledgeBase>(config, "/v1/knowledge-bases", {
        name: "Current Project Knowledge",
        template: "general",
      })
    ).id;
  const sourceWatchRule =
    config.sourceWatchLocation === undefined
      ? null
      : await postJson<{ rule: SourceWatchRule }>(
          config,
          `/v1/knowledge-bases/${knowledgeBaseId}/source-watch-rules`,
          {
            auto_ingest: true,
            location: config.sourceWatchLocation,
            name: "Current project source watch",
            schedule: {
              enabled: true,
              interval_seconds: 3600,
            },
            source_kind: "mounted_directory",
          },
        );
  const sourceWatchHistory =
    sourceWatchRule === null
      ? null
      : await getJson<SourceWatchScanHistory>(
          config,
          `/v1/source-watch-rules/${sourceWatchRule.rule.id}/scans?page=1&page_size=5`,
        );

  const source = await postJson<DocumentUploadResponse>(
    config,
    `/v1/knowledge-bases/${knowledgeBaseId}/documents/text`,
    {
      name: "Current project note",
      text: "Add confirmed project notes here before running the workflow.",
      source_path: "current-project/notes.md",
    },
  );
  const jobBatch = await postJson<BatchIngestJobStatusResponse>(config, "/v1/jobs/batch", {
    job_ids: [source.resources.job_id],
  });
  const ingestProgress = await getJson<KnowledgeBaseIngestProgress>(
    config,
    `/v1/knowledge-bases/${knowledgeBaseId}/ingest-progress`,
  );
  const job = jobBatch.items[0]?.job ?? source.job;
  const retrieval = await postJson<RetrieveResponse>(
    config,
    `/v1/knowledge-bases/${knowledgeBaseId}/retrieve`,
    {
      context_budget_tokens: 4000,
      query: "What context should the current project use?",
      mode: "hybrid",
      include_context_pack: true,
      include_expand_hints: true,
      include_resolved_evidence: true,
      include_trace: true,
    },
  );
  const expand = await postJson<RetrieveExpandResponse>(
    config,
    `/v1/knowledge-bases/${knowledgeBaseId}/retrieve/expand`,
    {
      seed_page_ids: retrieval.results.map((result) => result.page_id).slice(0, 3),
      depth: 1,
      include_context_pack: true,
    },
  );

  console.log(
    JSON.stringify(
      {
        knowledge_base_id: knowledgeBaseId,
        document_id: source.resources.source_document_id,
        ingest_progress: {
          counts: ingestProgress.counts,
          overall_progress: ingestProgress.overall_progress,
          retrieve_ready: ingestProgress.retrieve_ready,
        },
        job_id: job.id,
        job_status: job.status,
        next_action_links: source.links.map((link) => link.rel),
        media_evidence_count: retrieval.results.reduce(
          (total, item) => total + (item.media_evidence?.length ?? 0),
          0,
        ),
        resolved_evidence_count: retrieval.resolved_evidence?.items?.length ?? 0,
        retrieve_result_count: retrieval.results.length,
        source_watch_rule_id: sourceWatchRule?.rule.id ?? null,
        source_watch_scan_history_count: sourceWatchHistory?.items.length ?? 0,
        context_budget_strategy: retrieval.context_budget?.strategy_version ?? null,
        expand_result_count: expand.expanded_results?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

async function getJson<TData>(config: FococontextConfig, path: string): Promise<TData> {
  return requestJson<TData>(config, path, {
    method: "GET",
  });
}

async function postJson<TData>(
  config: FococontextConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<TData> {
  return requestJson<TData>(config, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function requestJson<TData>(
  config: FococontextConfig,
  path: string,
  init: RequestInit,
): Promise<TData> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const envelope = (await response.json()) as Envelope<TData>;

  if (!response.ok) {
    throw new Error(`FocoContext request failed: ${response.status}`);
  }

  return envelope.data;
}

function readRequiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  await runCurrentProjectWorkflow();
}
