export type SourceUploadMode = "auto" | "direct" | "multipart"

export interface DirectUploadSettings {
  ready: boolean
  thresholdBytes: number
}

export function readDirectUploadSettings(
  status: unknown
): DirectUploadSettings {
  const statusRecord = readRecord(status)
  const limits = readRecord(statusRecord.limits)
  const upload = readRecord(limits.upload)
  const directUpload = readRecord(upload.directUpload)
  const thresholdMb = readNumber(directUpload.thresholdMb) ?? 50

  return {
    ready: directUpload.ready === true,
    thresholdBytes: Math.max(0, thresholdMb) * 1024 * 1024,
  }
}

export function shouldUseDirectUpload(input: {
  directUploadSettings: DirectUploadSettings
  fileSize: number
  uploadMode: SourceUploadMode
}): boolean {
  if (!input.directUploadSettings.ready) {
    return false
  }

  if (input.uploadMode === "direct") {
    return true
  }

  if (input.uploadMode === "multipart") {
    return false
  }

  return input.fileSize >= input.directUploadSettings.thresholdBytes
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
