interface FococontextConfig {
  baseUrl: string;
  apiKey: string;
  knowledgeBaseId: string;
}

interface Envelope<TData> {
  data: TData;
  request_id: string;
}

interface RetrieveResult {
  page_id: string;
  page_version_id: string;
  title: string;
  section?: string;
  retrieval_reason?: string;
  citations?: Array<{
    document_id?: string;
    locator?: string;
  }>;
}

interface RetrieveResponse {
  results: RetrieveResult[];
  context_pack?: {
    markdown?: string;
  };
}

interface ExternalKnowledgeRecord {
  content: string;
  title: string;
  metadata: {
    page_id: string;
    page_version_id: string;
    retrieval_reason?: string;
    citations?: RetrieveResult["citations"];
  };
}

export function readFococontextConfig(env: NodeJS.ProcessEnv = process.env): FococontextConfig {
  return {
    baseUrl: readRequiredEnv(env, "FOCOCONTEXT_BASE_URL").replace(/\/$/, ""),
    apiKey: readRequiredEnv(env, "FOCOCONTEXT_API_KEY"),
    knowledgeBaseId: readRequiredEnv(env, "FOCOCONTEXT_KNOWLEDGE_BASE_ID"),
  };
}

export async function externalKnowledgeRetrieve(
  query: string,
  config: FococontextConfig = readFococontextConfig(),
): Promise<ExternalKnowledgeRecord[]> {
  const retrieval = await postJson<RetrieveResponse>(
    config,
    `/v1/knowledge-bases/${config.knowledgeBaseId}/retrieve`,
    {
      query,
      mode: "hybrid",
      include_context_pack: true,
      include_graph: true,
      include_trace: false,
    },
  );

  return retrieval.results.map((result) => ({
    content: result.section ?? retrieval.context_pack?.markdown ?? result.title,
    title: result.title,
    metadata: {
      page_id: result.page_id,
      page_version_id: result.page_version_id,
      retrieval_reason: result.retrieval_reason,
      citations: result.citations,
    },
  }));
}

async function postJson<TData>(
  config: FococontextConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<TData> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
  const records = await externalKnowledgeRetrieve("How should this app use FocoContext?");

  console.log(JSON.stringify(records, null, 2));
}
