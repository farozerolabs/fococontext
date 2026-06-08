import type { SourceDocumentDetail } from "@/api/fococontext-client.js"

import { getJobProgressValue, getJobStateLabelKey } from "./job-display.js"

export function sortSourceDetailsNewestFirst(
  details: readonly SourceDocumentDetail[]
): SourceDocumentDetail[] {
  return details
    .map((detail, index) => ({ detail, index }))
    .sort((left, right) => {
      const timestampDelta =
        readTimestamp(right.detail.document.updated_at) -
        readTimestamp(left.detail.document.updated_at)

      if (timestampDelta !== 0) {
        return timestampDelta
      }

      const idDelta = left.detail.document.id.localeCompare(
        right.detail.document.id
      )

      return idDelta === 0 ? left.index - right.index : idDelta
    })
    .map((item) => item.detail)
}

export function getSourceExplorerSubtitle(
  detail: Pick<SourceDocumentDetail, "document">,
  formatDate: (value: string) => string
): string {
  const sourceIdentity =
    detail.document.source_path ?? detail.document.source_type

  return `${formatDate(detail.document.updated_at)} - ${sourceIdentity}`
}

export function getSourceExplorerStatusLabelKey(
  detail: Pick<SourceDocumentDetail, "document" | "latest_job">
): string {
  if (detail.document.status === "deleted") {
    return "status.deleted"
  }

  if (detail.latest_job !== null) {
    return getJobStateLabelKey(detail.latest_job)
  }

  return `status.${detail.document.status}`
}

export function getSourceExplorerProgressValue(
  detail: Pick<SourceDocumentDetail, "document" | "latest_job">
): number | null {
  if (detail.document.status === "deleted") {
    return null
  }

  if (detail.latest_job === null) {
    return null
  }

  return getJobProgressValue(detail.latest_job)
}

function readTimestamp(value: string): number {
  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : 0
}
