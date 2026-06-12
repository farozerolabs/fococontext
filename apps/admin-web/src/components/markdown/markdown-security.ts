export function sanitizeMarkdownHref(href: string) {
  const normalizedHref = href.trim()

  if (
    normalizedHref.startsWith("http://") ||
    normalizedHref.startsWith("https://") ||
    normalizedHref.startsWith("/") ||
    normalizedHref.startsWith("#") ||
    isSafeImageDataUrl(normalizedHref)
  ) {
    return normalizedHref
  }

  return "#"
}

function isSafeImageDataUrl(href: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/iu.test(
    href
  )
}
