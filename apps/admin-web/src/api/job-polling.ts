import type { Job, SourceDocumentStatus } from "@/api/fococontext-client.js"

export const activeJobRefetchIntervalMs = 1500

export function isActiveJobStatus(status: Job["status"]) {
  return status === "queued" || status === "running"
}

export function isActiveSourceDocumentStatus(status: SourceDocumentStatus) {
  return status === "uploaded" || status === "queued" || status === "processing"
}

export function getActiveRefetchInterval(active: boolean) {
  return active ? activeJobRefetchIntervalMs : false
}
