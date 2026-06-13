import type {
  BoundedRetrievalRepository,
  RetrievalEmbeddingProvider,
  RetrievalRerankProvider,
} from "@fococontext/retrieval";
import {
  createOpenAICompatibleRetrievalEmbeddingProvider,
  createOpenAICompatibleRetrievalRerankProvider,
} from "@fococontext/retrieval";

export const boundedRetrievalRepositoryToken = Symbol("boundedRetrievalRepository");
export const retrievalEmbeddingProviderToken = Symbol("retrievalEmbeddingProvider");
export const retrievalRerankProviderToken = Symbol("retrievalRerankProvider");

export type ApiBoundedRetrievalRepository = BoundedRetrievalRepository;
export type ApiRetrievalEmbeddingProvider = RetrievalEmbeddingProvider;
export type ApiRetrievalRerankProvider = RetrievalRerankProvider;
export {
  createOpenAICompatibleRetrievalEmbeddingProvider,
  createOpenAICompatibleRetrievalRerankProvider,
};
