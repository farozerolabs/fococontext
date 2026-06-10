import type { RuntimeConfig } from "@fococontext/core";
import type {
  BoundedRetrievalRepository,
  RetrievalEmbeddingProvider,
  RetrievalRepository,
  RetrievalRerankProvider,
} from "@fococontext/retrieval";

export const boundedRetrievalRepositoryToken = Symbol("boundedRetrievalRepository");
export const retrievalRepositoryToken = Symbol("retrievalRepository");
export const retrievalEmbeddingProviderToken = Symbol("retrievalEmbeddingProvider");
export const retrievalRerankProviderToken = Symbol("retrievalRerankProvider");

export type ApiBoundedRetrievalRepository = BoundedRetrievalRepository;
export type ApiRetrievalRepository = RetrievalRepository;
export type ApiRetrievalEmbeddingProvider = RetrievalEmbeddingProvider;
export type ApiRetrievalRerankProvider = RetrievalRerankProvider;

type EmbeddingConfig = RuntimeConfig["models"]["embedding"];
type RerankConfig = NonNullable<RuntimeConfig["models"]["rerank"]>;
type EmbeddingFetch = (input: Request) => Promise<Response>;
type RerankFetch = (input: Request) => Promise<Response>;

interface OpenAIEmbeddingResponse {
  data?: Array<{
    embedding?: unknown;
    index?: unknown;
  }>;
}

interface OpenAIRerankResponse {
  results?: unknown;
  data?: unknown;
  rankedDocuments?: unknown;
}

export function createOpenAICompatibleRetrievalEmbeddingProvider(
  config: EmbeddingConfig,
  fetchFn: EmbeddingFetch = fetch,
): RetrievalEmbeddingProvider {
  return {
    dimensions: config.dimensions,
    model: config.model,
    async embed(input) {
      const response = await fetchFn(
        new Request(joinUrlPath(config.baseUrl, "embeddings"), {
          body: JSON.stringify({
            input: [...input.texts],
            model: config.model,
          }),
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
        }),
      );

      if (!response.ok) {
        throw new Error(`Embedding provider request failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as OpenAIEmbeddingResponse;
      const data = Array.isArray(payload.data) ? payload.data : [];

      return {
        vectors: input.texts.map((_, index) => readEmbeddingVector(data, index)),
      };
    },
  };
}

export function createOpenAICompatibleRetrievalRerankProvider(
  config: RerankConfig,
  fetchFn: RerankFetch = fetch,
): RetrievalRerankProvider {
  return {
    model: config.model,
    async rerank(input) {
      const response = await fetchFn(
        new Request(resolveRerankEndpoint(config.baseUrl), {
          body: JSON.stringify({
            documents: [...input.documents],
            model: config.model,
            query: input.query,
          }),
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
        }),
      );

      if (!response.ok) {
        throw new Error(`Rerank provider request failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as OpenAIRerankResponse;
      const rankedDocuments = readRerankResults(payload);

      if (rankedDocuments.length === 0) {
        throw new Error("Rerank provider response did not include ranked documents.");
      }

      return {
        rankedDocuments,
      };
    },
  };
}

function readEmbeddingVector(data: NonNullable<OpenAIEmbeddingResponse["data"]>, index: number) {
  const item = data.find((candidate) => candidate.index === index) ?? data[index];
  const embedding = item?.embedding;

  if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === "number")) {
    throw new Error("Embedding provider response did not include a valid vector.");
  }

  return [...embedding];
}

function readRerankResults(payload: OpenAIRerankResponse): Array<{ index: number; score: number }> {
  const results =
    readArray(payload.results) ??
    readArray(payload.data) ??
    readArray(payload.rankedDocuments) ??
    [];

  return results.flatMap((item) => {
    const record = readRecord(item);
    const index = readNumber(record.index);
    const score = readNumber(record.score) ?? readNumber(record.relevance_score);

    if (index === null || score === null) {
      return [];
    }

    return [
      {
        index,
        score,
      },
    ];
  });
}

function readArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveRerankEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");

  return /\/rerank$/u.test(trimmed) ? trimmed : joinUrlPath(trimmed, "rerank");
}

function joinUrlPath(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/u, "")}/${path}`;
}
