export type JobProgressStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export type JobProgressStage =
  | "uploading"
  | "parsing"
  | "ocr"
  | "captioning"
  | "analyzing"
  | "generating"
  | "merging"
  | "indexing";

export type JobProgressEventType =
  | "job.queued"
  | "job.running"
  | "job.completed"
  | "job.failed"
  | "job.canceled";

export interface JobProgressStateInput {
  progress: number;
  progressMessage: string;
  status: JobProgressStatus;
}

export interface JobProgressState {
  progress: number;
  progressMessage: string;
}

export interface JobProgressTimelineEvent {
  createdAt: string;
  message: string;
  metadata: Record<string, unknown>;
  stage: JobProgressStage;
  status: JobProgressStatus;
  type: JobProgressEventType;
}

const terminalJobProgressMessages: Record<
  Extract<JobProgressStatus, "completed" | "failed" | "canceled">,
  string
> = {
  canceled: "Job canceled.",
  completed: "Job completed.",
  failed: "Job failed.",
};

const activeJobProgressMessages = new Set([
  "Analyzing content...",
  "Analyzing OCR-enriched content...",
  "Applying generated wiki draft...",
  "Captioning media assets...",
  "Generating Wiki pages...",
  "Generating wiki drafts...",
  "Indexing applied wiki draft...",
  "Merging generated wiki drafts...",
  "Merging pages...",
  "Parsing document...",
  "Parsing source document.",
  "Queued for ingest.",
  "Queued for OCR retry.",
  "Queued for parsing.",
  "Queued for re-ingest parsing.",
  "Queued for retry.",
  "Queued for Wiki Draft parsing.",
  "Rendering PDF pages for OCR...",
  "Running OCR...",
  "Running OCR on scanned PDF pages...",
  "Updating indexes...",
]);

export function isTerminalJobStatus(
  status: JobProgressStatus,
): status is Extract<JobProgressStatus, "completed" | "failed" | "canceled"> {
  return status === "completed" || status === "failed" || status === "canceled";
}

export function resolveJobProgressState(input: JobProgressStateInput): JobProgressState {
  const progress = normalizeProgress(input.progress);

  if (input.status === "completed") {
    return {
      progress: 100,
      progressMessage: resolveTerminalProgressMessage(input),
    };
  }

  if (input.status === "failed" || input.status === "canceled") {
    return {
      progress: Math.min(progress, 99),
      progressMessage: resolveTerminalProgressMessage(input),
    };
  }

  return {
    progress: Math.min(progress, 99),
    progressMessage: input.progressMessage,
  };
}

export function normalizeJobTimelineEvents<T extends JobProgressTimelineEvent>(
  events: readonly T[],
): T[] {
  const lastTerminalEventIndexes = new Map<JobProgressEventType, number>();

  events.forEach((event, index) => {
    if (isTerminalJobEventType(event.type)) {
      lastTerminalEventIndexes.set(event.type, index);
    }
  });

  return events.filter((event, index) => {
    if (!isTerminalJobEventType(event.type)) {
      return true;
    }

    return lastTerminalEventIndexes.get(event.type) === index;
  });
}

export function isTerminalJobEventType(
  type: JobProgressEventType,
): type is Extract<JobProgressEventType, "job.completed" | "job.failed" | "job.canceled"> {
  return type === "job.completed" || type === "job.failed" || type === "job.canceled";
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(progress)));
}

function resolveTerminalProgressMessage(input: JobProgressStateInput): string {
  const message = input.progressMessage.trim();

  if (message.length === 0 || activeJobProgressMessages.has(message)) {
    return terminalJobProgressMessages[input.status as keyof typeof terminalJobProgressMessages];
  }

  return message;
}
