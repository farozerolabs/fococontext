import type {
  Job,
  JobEvent,
  JobStage,
  JobStatus,
} from "@/api/fococontext-client.js"

const stageProgressKeys: Record<JobStage, string> = {
  analyzing: "progress.analyzing",
  captioning: "progress.captioning",
  generating: "progress.generating",
  indexing: "progress.indexing",
  merging: "progress.merging",
  ocr: "progress.ocr",
  parsing: "progress.parsing",
  uploading: "progress.uploading",
}

const completedStageStateKeys: Record<JobStage, string> = {
  analyzing: "job.timelineState.completed.analyzing",
  captioning: "job.timelineState.completed.captioning",
  generating: "job.timelineState.completed.generating",
  indexing: "job.timelineState.completed.indexing",
  merging: "job.timelineState.completed.merging",
  ocr: "job.timelineState.completed.ocr",
  parsing: "job.timelineState.completed.parsing",
  uploading: "job.timelineState.completed.uploading",
}

const failedStageStateKeys: Record<JobStage, string> = {
  analyzing: "job.timelineState.failed.analyzing",
  captioning: "job.timelineState.failed.captioning",
  generating: "job.timelineState.failed.generating",
  indexing: "job.timelineState.failed.indexing",
  merging: "job.timelineState.failed.merging",
  ocr: "job.timelineState.failed.ocr",
  parsing: "job.timelineState.failed.parsing",
  uploading: "job.timelineState.failed.uploading",
}

const canceledStageStateKeys: Record<JobStage, string> = {
  analyzing: "job.timelineState.canceled.analyzing",
  captioning: "job.timelineState.canceled.captioning",
  generating: "job.timelineState.canceled.generating",
  indexing: "job.timelineState.canceled.indexing",
  merging: "job.timelineState.canceled.merging",
  ocr: "job.timelineState.canceled.ocr",
  parsing: "job.timelineState.canceled.parsing",
  uploading: "job.timelineState.canceled.uploading",
}

const queuedStageMessageKeys: Record<JobStage, string> = {
  analyzing: "job.timelineMessage.queued.analyzing",
  captioning: "job.timelineMessage.queued.captioning",
  generating: "job.timelineMessage.queued.generating",
  indexing: "job.timelineMessage.queued.indexing",
  merging: "job.timelineMessage.queued.merging",
  ocr: "job.timelineMessage.queued.ocr",
  parsing: "job.timelineMessage.queued.parsing",
  uploading: "job.timelineMessage.queued.uploading",
}

const runningStageMessageKeys: Record<JobStage, string> = {
  analyzing: "job.timelineMessage.running.analyzing",
  captioning: "job.timelineMessage.running.captioning",
  generating: "job.timelineMessage.running.generating",
  indexing: "job.timelineMessage.running.indexing",
  merging: "job.timelineMessage.running.merging",
  ocr: "job.timelineMessage.running.ocr",
  parsing: "job.timelineMessage.running.parsing",
  uploading: "job.timelineMessage.running.uploading",
}

const completedStageMessageKeys: Record<JobStage, string> = {
  analyzing: "job.timelineMessage.completed.analyzing",
  captioning: "job.timelineMessage.completed.captioning",
  generating: "job.timelineMessage.completed.generating",
  indexing: "job.timelineMessage.completed.indexing",
  merging: "job.timelineMessage.completed.merging",
  ocr: "job.timelineMessage.completed.ocr",
  parsing: "job.timelineMessage.completed.parsing",
  uploading: "job.timelineMessage.completed.uploading",
}

const failedStageMessageKeys: Record<JobStage, string> = {
  analyzing: "job.timelineMessage.failed.analyzing",
  captioning: "job.timelineMessage.failed.captioning",
  generating: "job.timelineMessage.failed.generating",
  indexing: "job.timelineMessage.failed.indexing",
  merging: "job.timelineMessage.failed.merging",
  ocr: "job.timelineMessage.failed.ocr",
  parsing: "job.timelineMessage.failed.parsing",
  uploading: "job.timelineMessage.failed.uploading",
}

const canceledStageMessageKeys: Record<JobStage, string> = {
  analyzing: "job.timelineMessage.canceled.analyzing",
  captioning: "job.timelineMessage.canceled.captioning",
  generating: "job.timelineMessage.canceled.generating",
  indexing: "job.timelineMessage.canceled.indexing",
  merging: "job.timelineMessage.canceled.merging",
  ocr: "job.timelineMessage.canceled.ocr",
  parsing: "job.timelineMessage.canceled.parsing",
  uploading: "job.timelineMessage.canceled.uploading",
}

export function getJobStateLabelKey(
  job: Pick<Job, "stage" | "status">
): string {
  if (job.status === "completed") {
    return "progress.completed"
  }
  if (job.status === "failed") {
    return "progress.failed"
  }
  if (job.status === "canceled") {
    return "progress.canceled"
  }

  return stageProgressKeys[job.stage]
}

export const getJobProgressLabelKey = getJobStateLabelKey

export function getJobProgressValue(
  job: Pick<Job, "progress" | "status">
): number {
  if (job.status === "completed") {
    return 100
  }

  return Math.min(normalizeProgress(job.progress), 99)
}

export function sortJobTimelineEvents(events: readonly JobEvent[]): JobEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const timestampDelta =
        Date.parse(right.event.created_at) - Date.parse(left.event.created_at)

      return timestampDelta === 0 ? left.index - right.index : timestampDelta
    })
    .map((item) => item.event)
}

export function getTimelineEventDisplayStatus(
  event: JobEvent,
  job: Pick<Job, "status">
): JobStatus {
  if (event.status === "completed" || event.status === "failed") {
    return event.status
  }
  if (event.status === "canceled") {
    return "canceled"
  }
  if (job.status === "completed") {
    return "completed"
  }
  if (job.status === "failed") {
    return "completed"
  }
  if (job.status === "canceled") {
    return "canceled"
  }

  return event.status
}

export function getTimelineEventStateLabelKey(
  event: JobEvent,
  job: Pick<Job, "status">
): string {
  const status = getTimelineEventDisplayStatus(event, job)

  if (status === "completed") {
    return event.type === "job.completed"
      ? "progress.completed"
      : completedStageStateKeys[event.stage]
  }
  if (status === "failed") {
    return failedStageStateKeys[event.stage]
  }
  if (status === "canceled") {
    return canceledStageStateKeys[event.stage]
  }
  if (status === "queued") {
    return "progress.queued"
  }

  return stageProgressKeys[event.stage]
}

export function getTimelineEventMessageKey(
  event: JobEvent,
  job: Pick<Job, "status">
): string {
  const status = getTimelineEventDisplayStatus(event, job)

  if (status === "completed") {
    return event.type === "job.completed"
      ? "job.timelineMessage.completed.task"
      : completedStageMessageKeys[event.stage]
  }
  if (status === "failed") {
    return event.type === "job.failed"
      ? "job.timelineMessage.failed.task"
      : failedStageMessageKeys[event.stage]
  }
  if (status === "canceled") {
    return event.type === "job.canceled"
      ? "job.timelineMessage.canceled.task"
      : canceledStageMessageKeys[event.stage]
  }
  if (status === "queued") {
    return queuedStageMessageKeys[event.stage]
  }

  return runningStageMessageKeys[event.stage]
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(progress)))
}
