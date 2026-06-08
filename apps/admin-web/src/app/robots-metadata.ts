import { adminPublicCanonicalPath } from "@/app/seo-metadata.js"

export const indexableRobotsContent = "index, follow"
export const privateRobotsContent = "noindex, nofollow, noarchive"

export function getRobotsContentForPathname(pathname: string) {
  return isIndexableAdminPathname(pathname)
    ? indexableRobotsContent
    : privateRobotsContent
}

export function isIndexableAdminPathname(pathname: string) {
  return normalizePathname(pathname) === adminPublicCanonicalPath
}

export function getCanonicalHrefForPathname(
  pathname: string,
  publicOrigin: string
) {
  return isIndexableAdminPathname(pathname)
    ? createPublicUrl(publicOrigin, adminPublicCanonicalPath)
    : null
}

export function createPublicUrl(publicOrigin: string, pathname: string) {
  const normalizedOrigin = publicOrigin.trim().replace(/\/+$/u, "")
  const normalizedPathname = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`
  return `${normalizedOrigin}${normalizedPathname}`
}

export function updateRouteSearchMetadata(pathname: string) {
  const canonicalHref = getCanonicalHrefForPathname(
    pathname,
    window.location.origin
  )

  updateRobotsMeta(getRobotsContentForPathname(pathname))
  updateCanonicalLink(canonicalHref)
  updateOpenGraphUrlMeta(canonicalHref)
}

export function updateRobotsMeta(content: string) {
  const existingMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="robots"]'
  )
  const robotsMeta =
    existingMeta ??
    Object.assign(document.createElement("meta"), {
      name: "robots",
    })

  robotsMeta.content = content

  if (existingMeta === null) {
    document.head.append(robotsMeta)
  }
}

function updateCanonicalLink(href: string | null) {
  const existingLink = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  )

  if (href === null) {
    existingLink?.remove()
    return
  }

  const canonicalLink =
    existingLink ??
    Object.assign(document.createElement("link"), {
      rel: "canonical",
    })

  canonicalLink.href = href

  if (existingLink === null) {
    document.head.append(canonicalLink)
  }
}

function updateOpenGraphUrlMeta(content: string | null) {
  const existingMeta = document.querySelector<HTMLMetaElement>(
    'meta[property="og:url"]'
  )

  if (content === null) {
    existingMeta?.remove()
    return
  }

  const openGraphUrlMeta = existingMeta ?? document.createElement("meta")

  openGraphUrlMeta.setAttribute("property", "og:url")
  openGraphUrlMeta.content = content

  if (existingMeta === null) {
    document.head.append(openGraphUrlMeta)
  }
}

function normalizePathname(pathname: string) {
  const withoutTrailingSlash = pathname.replace(/\/+$/u, "")
  return withoutTrailingSlash.length === 0 ? "/" : withoutTrailingSlash
}
