import type { PromptVersionRecord } from "./prompt-templates.js";
import type { ChatCompletionResponseFormat } from "./structured-json.js";

export {
  builtInPromptVersionRecords,
  createDefaultDatasetPromptTemplates,
  getBuiltInPromptVersion,
  normalizeDatasetPromptTemplates,
  promptPurposes,
  PromptTemplateValidationError,
  resolveDatasetPromptTemplate,
  resolveDatasetPromptTemplateFromSnapshot,
} from "./prompt-templates.js";
export type {
  DatasetPromptTemplateValue,
  DatasetPromptTemplateValues,
  PromptPurpose,
  PromptTemplateMode,
  PromptVersionRecord,
  ResolvedDatasetPromptTemplate,
} from "./prompt-templates.js";

export {
  analysisOutputContract,
  analysisOutputShape,
  analysisStructuredOutputJsonSchema,
  completeStructuredJsonOutput,
  generationDraftOutputContract,
  generationDraftOutputShape,
  generationStructuredOutputJsonSchema,
  readStructuredJsonOutputErrorMetadata,
  semanticKnowledgeCheckOutputContract,
  semanticKnowledgeCheckOutputShape,
  semanticKnowledgeCheckStructuredOutputJsonSchema,
  structuredJsonOnlyInstruction,
} from "./structured-json.js";
export type {
  ChatCompletionResponseFormat,
  JsonSchemaValue,
  StructuredJsonOutputFailureMetadata,
  StructuredJsonOutputResult,
  StructuredJsonOutputSchema,
  StructuredOutputFinalStatus,
  StructuredOutputMode,
} from "./structured-json.js";

export type ChatModelPurpose = "default" | "analysis" | "generation" | "merge";
export interface RuntimeModelProviderConfig {
  chat: {
    providerName: string;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    requestMaxRetries: number;
    analysisModel: string;
    generationModel: string;
    mergeModel: string;
  };
  embedding: {
    providerName: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    dimensions: number;
  };
  rerank?: {
    providerName: string;
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  visionCaption?: {
    providerName: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    requestMaxRetries: number;
  };
}

export interface OpenAICompatibleChatProfile {
  kind: "chat";
  providerName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  requestMaxRetries: number;
  taskModels: {
    analysis: string;
    generation: string;
    merge: string;
  };
}

export interface OpenAICompatibleEmbeddingProfile {
  kind: "embedding";
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
}

export interface OpenAICompatibleRerankProfile {
  kind: "rerank";
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface OpenAICompatibleVisionCaptionProfile {
  kind: "vision_caption";
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  requestMaxRetries: number;
}

export interface ResolvedModelProviderProfiles {
  chat: OpenAICompatibleChatProfile;
  embedding: OpenAICompatibleEmbeddingProfile;
  rerank?: OpenAICompatibleRerankProfile;
  visionCaption?: OpenAICompatibleVisionCaptionProfile;
}

export interface ChatProvider {
  readonly profile: OpenAICompatibleChatProfile;
  complete(input: ChatCompletionInput): Promise<ChatCompletionResult>;
}

export interface EmbeddingProvider {
  readonly profile: OpenAICompatibleEmbeddingProfile;
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;
}

export interface RerankProvider {
  readonly profile: OpenAICompatibleRerankProfile;
  rerank(input: RerankInput): Promise<RerankResult>;
}

export interface VisionCaptionProvider {
  readonly profile: OpenAICompatibleVisionCaptionProfile;
  caption(input: VisionCaptionInput): Promise<VisionCaptionResult>;
}

export type ChatMessageContentBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      mediaType: string;
      dataBase64: string;
    };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatMessageContentBlock[];
}

export interface ChatCompletionInput {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  responseFormat?: ChatCompletionResponseFormat;
  temperature?: number;
  timeoutMs?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: ModelCallUsage;
}

export interface EmbeddingInput {
  model: string;
  input: string[];
}

export interface EmbeddingResult {
  vectors: number[][];
  usage?: ModelCallUsage;
}

export interface RerankInput {
  model: string;
  query: string;
  documents: string[];
}

export interface RerankResult {
  rankedDocuments: Array<{
    index: number;
    score: number;
  }>;
  usage?: ModelCallUsage;
}

export interface VisionCaptionInput {
  image: {
    dataBase64: string;
    mediaType: string;
  };
  maxOutputTokens: number;
  prompt: string;
  timeoutMs?: number;
}

export interface VisionCaptionResult {
  content: string;
  usage?: ModelCallUsage;
}

export interface ModelCallUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type ModelCallOutputStatus = "succeeded" | "failed" | "cancelled";

export interface ModelCallMetadataInput {
  providerName: string;
  model: string;
  promptVersion: string;
  inputSummary: string;
  outputStatus: ModelCallOutputStatus;
  knowledgeBaseId?: string;
  sourceDocumentId?: string;
  parsedContentId?: string;
  jobId?: string;
  changeSetId?: string;
  outputSummary?: string | null;
  usage?: ModelCallUsage;
  costEstimateUsd?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelCallMetadataRecord extends ModelCallMetadataInput {
  id: string;
  createdAt: Date;
}

export interface ModelCallRecorder {
  record(input: ModelCallMetadataInput): Promise<ModelCallMetadataRecord>;
}

export interface PromptCallRecorderOptions {
  estimateCostUsd?: (usage: ModelCallUsage) => number;
}

export interface PromptCompletionInput {
  prompt: PromptVersionRecord;
  messages: ChatMessage[];
  inputSummary: string;
  jobId?: string;
  changeSetId?: string;
}

export class PromptCallRecorder {
  private readonly chatProvider: ChatProvider;
  private readonly modelCallRecorder: ModelCallRecorder;
  private readonly options: PromptCallRecorderOptions;

  constructor(
    chatProvider: ChatProvider,
    modelCallRecorder: ModelCallRecorder,
    options: PromptCallRecorderOptions = {},
  ) {
    this.chatProvider = chatProvider;
    this.modelCallRecorder = modelCallRecorder;
    this.options = options;
  }

  async complete(input: PromptCompletionInput): Promise<ChatCompletionResult> {
    const model = resolveChatModel(this.chatProvider.profile, input.prompt.modelPurpose);

    try {
      const result = await this.chatProvider.complete({
        model,
        messages: input.messages.map((message) => ({ ...message })),
      });

      await this.recordModelCall(input, model, "succeeded", result.usage);

      return result;
    } catch (error) {
      await this.recordModelCall(input, model, "failed");

      throw error;
    }
  }

  private async recordModelCall(
    input: PromptCompletionInput,
    model: string,
    outputStatus: ModelCallOutputStatus,
    usage?: ModelCallUsage,
  ): Promise<ModelCallMetadataRecord> {
    const recordInput: ModelCallMetadataInput = {
      providerName: this.chatProvider.profile.providerName,
      model,
      promptVersion: input.prompt.id,
      inputSummary: input.inputSummary,
      outputStatus,
    };

    if (input.jobId !== undefined) {
      recordInput.jobId = input.jobId;
    }
    if (input.changeSetId !== undefined) {
      recordInput.changeSetId = input.changeSetId;
    }
    if (usage !== undefined) {
      recordInput.usage = { ...usage };

      if (this.options.estimateCostUsd !== undefined) {
        recordInput.costEstimateUsd = this.options.estimateCostUsd(usage);
      }
    }

    return this.modelCallRecorder.record(recordInput);
  }
}

export function resolveModelProviderProfiles(
  config: RuntimeModelProviderConfig,
): ResolvedModelProviderProfiles {
  const profiles: ResolvedModelProviderProfiles = {
    chat: {
      kind: "chat",
      providerName: config.chat.providerName,
      baseUrl: config.chat.baseUrl,
      apiKey: config.chat.apiKey,
      defaultModel: config.chat.defaultModel,
      requestMaxRetries: config.chat.requestMaxRetries,
      taskModels: {
        analysis: config.chat.analysisModel,
        generation: config.chat.generationModel,
        merge: config.chat.mergeModel,
      },
    },
    embedding: {
      kind: "embedding",
      providerName: config.embedding.providerName,
      baseUrl: config.embedding.baseUrl,
      apiKey: config.embedding.apiKey,
      model: config.embedding.model,
      dimensions: config.embedding.dimensions,
    },
  };

  if (config.rerank !== undefined) {
    profiles.rerank = {
      kind: "rerank",
      providerName: config.rerank.providerName,
      baseUrl: config.rerank.baseUrl,
      apiKey: config.rerank.apiKey,
      model: config.rerank.model,
    };
  }

  if (config.visionCaption !== undefined) {
    profiles.visionCaption = {
      kind: "vision_caption",
      providerName: config.visionCaption.providerName,
      baseUrl: config.visionCaption.baseUrl,
      apiKey: config.visionCaption.apiKey,
      model: config.visionCaption.model,
      requestMaxRetries: config.visionCaption.requestMaxRetries,
    };
  }

  return profiles;
}

export function resolveChatModel(
  profile: OpenAICompatibleChatProfile,
  purpose: ChatModelPurpose,
): string {
  if (purpose === "default") {
    return profile.defaultModel;
  }

  return profile.taskModels[purpose];
}

export interface OpenAICompatibleChatProviderOptions {
  fetch?: (request: Request) => Promise<Response>;
  retryBackoffMs?: (attempt: number) => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export function createOpenAICompatibleChatProvider(
  profile: OpenAICompatibleChatProfile,
  options: OpenAICompatibleChatProviderOptions = {},
): ChatProvider {
  const fetchImpl = options.fetch ?? fetch;
  const retryBackoffMs = options.retryBackoffMs ?? defaultChatRetryBackoffMs;
  const sleep = options.sleep ?? sleepFor;

  return {
    profile,
    async complete(input) {
      let attempt = 0;

      while (true) {
        try {
          return await completeStreamingChatRequest(profile, input, fetchImpl);
        } catch (error) {
          if (attempt >= profile.requestMaxRetries || !isRetryableChatProviderError(error)) {
            throw error;
          }

          attempt += 1;
          await sleep(retryBackoffMs(attempt));
        }
      }
    },
  };
}

export function createOpenAICompatibleVisionCaptionProvider(
  profile: OpenAICompatibleVisionCaptionProfile,
  options: OpenAICompatibleChatProviderOptions = {},
): VisionCaptionProvider {
  const chatProvider = createOpenAICompatibleChatProvider(
    {
      kind: "chat",
      providerName: profile.providerName,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      defaultModel: profile.model,
      requestMaxRetries: profile.requestMaxRetries,
      taskModels: {
        analysis: profile.model,
        generation: profile.model,
        merge: profile.model,
      },
    },
    options,
  );

  return {
    profile,
    async caption(input) {
      const completionInput: ChatCompletionInput = {
        model: profile.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: input.prompt,
              },
              {
                type: "image",
                mediaType: input.image.mediaType,
                dataBase64: input.image.dataBase64,
              },
            ],
          },
        ],
        maxTokens: input.maxOutputTokens,
        temperature: 0,
      };

      if (input.timeoutMs !== undefined) {
        completionInput.timeoutMs = input.timeoutMs;
      }

      const result = await chatProvider.complete(completionInput);

      return result;
    },
  };
}

export function createPromptCallRecorder(
  chatProvider: ChatProvider,
  modelCallRecorder: ModelCallRecorder,
  options: PromptCallRecorderOptions = {},
): PromptCallRecorder {
  return new PromptCallRecorder(chatProvider, modelCallRecorder, options);
}

interface OpenAICompatibleChatCompletionResponse {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
}

class ChatProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Chat provider request failed with status ${status}.`);
    this.status = status;
  }
}

async function completeStreamingChatRequest(
  profile: OpenAICompatibleChatProfile,
  input: ChatCompletionInput,
  fetchImpl: (request: Request) => Promise<Response>,
): Promise<ChatCompletionResult> {
  const request = new Request(createChatCompletionUrl(profile.baseUrl), {
    body: JSON.stringify({
      model: input.model,
      messages: input.messages.map((message) => ({
        role: message.role,
        content: serializeChatMessageContent(message.content),
      })),
      ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
      ...(input.responseFormat === undefined
        ? {}
        : {
            response_format: serializeChatCompletionResponseFormat(input.responseFormat),
          }),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      stream: true,
    }),
    headers: {
      authorization: `Bearer ${profile.apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
    ...(input.timeoutMs === undefined ? {} : { signal: AbortSignal.timeout(input.timeoutMs) }),
  });
  const response = await fetchImpl(request);

  if (!response.ok) {
    throw new ChatProviderHttpError(response.status);
  }

  return readStreamingChatCompletion(response);
}

function serializeChatCompletionResponseFormat(format: ChatCompletionResponseFormat): unknown {
  if (format.type === "json_object") {
    return {
      type: "json_object",
    };
  }

  return {
    type: "json_schema",
    json_schema: {
      name: format.jsonSchema.name,
      schema: format.jsonSchema.schema,
      strict: format.jsonSchema.strict ?? true,
    },
  };
}

function serializeChatMessageContent(content: ChatMessage["content"]): unknown {
  if (typeof content === "string") {
    return content;
  }

  return content.map((block) => {
    if (block.type === "text") {
      return {
        type: "text",
        text: block.text,
      };
    }

    return {
      type: "image_url",
      image_url: {
        url: `data:${block.mediaType};base64,${block.dataBase64}`,
      },
    };
  });
}

function createChatCompletionUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");

  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

async function readStreamingChatCompletion(response: Response): Promise<ChatCompletionResult> {
  if (response.body === null) {
    throw new Error("Chat provider streaming response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: ModelCallUsage | undefined;
  let streamFinished = false;

  while (!streamFinished) {
    const result = await reader.read();

    if (result.done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(result.value, { stream: true });
    const consumed = consumeServerSentEvents(buffer, (data) => {
      if (data === "[DONE]") {
        streamFinished = true;
        return;
      }

      const chunk = JSON.parse(data) as OpenAICompatibleChatCompletionResponse;
      content += readStreamingAssistantContent(chunk);
      usage = readOpenAICompatibleUsage(chunk.usage).usage ?? usage;
    });

    buffer = consumed.remaining;
  }

  if (!streamFinished && buffer.trim().length > 0) {
    consumeServerSentEvents(`${buffer}\n\n`, (data) => {
      if (data === "[DONE]") {
        return;
      }

      const chunk = JSON.parse(data) as OpenAICompatibleChatCompletionResponse;
      content += readStreamingAssistantContent(chunk);
      usage = readOpenAICompatibleUsage(chunk.usage).usage ?? usage;
    });
  }

  if (content.length === 0) {
    throw new Error("Chat provider response did not include assistant content.");
  }

  return {
    content,
    ...(usage === undefined ? {} : { usage }),
  };
}

function consumeServerSentEvents(
  buffer: string,
  onData: (data: string) => void,
): { remaining: string } {
  let remaining = buffer;
  let delimiter = remaining.match(/\r?\n\r?\n/u);

  while (delimiter !== null && delimiter.index !== undefined) {
    const block = remaining.slice(0, delimiter.index);
    remaining = remaining.slice(delimiter.index + delimiter[0].length);
    const data = readServerSentEventData(block);

    if (data.length > 0) {
      onData(data);
    }

    delimiter = remaining.match(/\r?\n\r?\n/u);
  }

  return { remaining };
}

function readServerSentEventData(block: string): string {
  return block
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
}

function readStreamingAssistantContent(body: OpenAICompatibleChatCompletionResponse): string {
  return (
    body.choices
      ?.map((choice) => readContentValue(choice.delta?.content ?? choice.message?.content))
      .join("") ?? ""
  );
}

function readContentValue(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(readTextContentPart).join("");
  }

  return "";
}

function readTextContentPart(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  ) {
    return value.text;
  }

  return "";
}

function isRetryableChatProviderError(error: unknown): boolean {
  if (error instanceof ChatProviderHttpError) {
    return isRetryableChatProviderStatus(error.status);
  }

  return error instanceof TypeError;
}

function isRetryableChatProviderStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 524 || status >= 500;
}

function defaultChatRetryBackoffMs(attempt: number): number {
  return Math.min(5_000, 250 * 2 ** Math.max(0, attempt - 1));
}

function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readOpenAICompatibleUsage(usage: OpenAICompatibleChatCompletionResponse["usage"]): {
  usage?: ModelCallUsage;
} {
  if (usage === undefined) {
    return {};
  }

  const result: ModelCallUsage = {};

  if (typeof usage.prompt_tokens === "number") {
    result.inputTokens = usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === "number") {
    result.outputTokens = usage.completion_tokens;
  }
  if (typeof usage.total_tokens === "number") {
    result.totalTokens = usage.total_tokens;
  }

  return Object.keys(result).length === 0 ? {} : { usage: result };
}
