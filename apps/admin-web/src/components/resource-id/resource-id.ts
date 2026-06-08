const defaultHeadLength = 7
const defaultTailLength = 4
const separator = "..."

export function formatResourceId(
  resourceId: string,
  headLength = defaultHeadLength,
  tailLength = defaultTailLength
) {
  const minimumTruncatedLength = headLength + tailLength + separator.length

  if (resourceId.length <= minimumTruncatedLength) {
    return resourceId
  }

  return `${resourceId.slice(0, headLength)}${separator}${resourceId.slice(-tailLength)}`
}
