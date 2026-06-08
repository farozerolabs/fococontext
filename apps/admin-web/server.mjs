import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = fileURLToPath(new URL(".", import.meta.url))
const distRoot = join(appRoot, "dist")
const port = Number.parseInt(process.env.FOCOCONTEXT_ADMIN_PORT ?? "18081", 10)
const apiBaseUrl =
  process.env.FOCOCONTEXT_ADMIN_API_BASE_URL ??
  process.env.VITE_FOCOCONTEXT_API_BASE_URL ??
  "http://localhost:18080/v1"
const adminBaseUrl = process.env.FOCOCONTEXT_ADMIN_BASE_URL ?? ""
const indexableRobotsHeader = "index, follow"
const privateRobotsHeader = "noindex, nofollow, noarchive"
const publicCanonicalPath = "/login"
const openGraphImagePath = "/og/og.png"
const twitterImagePath = "/og/x-og.png"

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
])

function getRobotsHeaderForPathname(pathname) {
  return normalizeSpaPathname(pathname) === "/login"
    ? indexableRobotsHeader
    : privateRobotsHeader
}

function renderIndexHtml(html, request, pathname) {
  const isIndexableRoute =
    getRobotsHeaderForPathname(pathname) === indexableRobotsHeader
  const canonicalUrl = toPublicUrl(request, publicCanonicalPath)
  const openGraphImageUrl = toPublicUrl(request, openGraphImagePath)
  const twitterImageUrl = toPublicUrl(request, twitterImagePath)

  return html
    .replace(
      /<meta name="robots" content="[^"]*" \/>/u,
      `<meta name="robots" content="${getRobotsHeaderForPathname(pathname)}" />`
    )
    .replace(
      /\s*<link rel="canonical" href="[^"]*" \/>/u,
      isIndexableRoute
        ? `\n    <link rel="canonical" href="${canonicalUrl}" />`
        : ""
    )
    .replace(
      /\s*<meta property="og:url" content="[^"]*" \/>/u,
      isIndexableRoute
        ? `\n    <meta property="og:url" content="${canonicalUrl}" />`
        : ""
    )
    .replace(
      /<meta property="og:image" content="[^"]*" \/>/u,
      `<meta property="og:image" content="${openGraphImageUrl}" />`
    )
    .replace(
      /<meta name="twitter:image" content="[^"]*" \/>/u,
      `<meta name="twitter:image" content="${twitterImageUrl}" />`
    )
}

function toPublicUrl(request, pathname) {
  const normalizedPathname = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`
  return `${getPublicBaseUrl(request)}${normalizedPathname}`
}

function getPublicBaseUrl(request) {
  const configuredBaseUrl = adminBaseUrl.trim().replace(/\/+$/u, "")

  if (configuredBaseUrl.length > 0) {
    return configuredBaseUrl
  }

  const forwardedProto = firstHeaderValue(request.headers["x-forwarded-proto"])
  const forwardedHost = firstHeaderValue(request.headers["x-forwarded-host"])
  const protocol = forwardedProto ?? "http"
  const host = forwardedHost ?? request.headers.host ?? `localhost:${port}`

  return `${protocol}://${host}`.replace(/\/+$/u, "")
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value?.split(",")[0]?.trim() || undefined
}

function normalizeSpaPathname(pathname) {
  const normalizedPathname = pathname.replace(/\/+$/u, "")
  return normalizedPathname.length === 0 ? "/" : normalizedPathname
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost")

  if (url.pathname === "/runtime-config.js") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/javascript; charset=utf-8",
    })
    response.end(
      `window.__FOCOCONTEXT_RUNTIME_CONFIG__ = ${JSON.stringify({
        adminBaseUrl,
        apiBaseUrl,
      })};`
    )
    return
  }

  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(
    /^(\.\.[/\\])+/,
    ""
  )
  const candidatePath = join(
    distRoot,
    requestedPath === "/" ? "index.html" : requestedPath
  )
  const filePath = existsSync(candidatePath)
    ? candidatePath
    : join(distRoot, "index.html")
  const contentType =
    mimeTypes.get(extname(filePath)) ?? "application/octet-stream"
  const isIndexHtmlResponse = filePath === join(distRoot, "index.html")
  const responseHeaders = {
    "content-type": contentType,
    ...(isIndexHtmlResponse
      ? { "x-robots-tag": getRobotsHeaderForPathname(url.pathname) }
      : {}),
  }

  try {
    const content = await readFile(filePath)
    response.writeHead(200, responseHeaders)
    response.end(
      isIndexHtmlResponse
        ? renderIndexHtml(content.toString("utf8"), request, url.pathname)
        : content
    )
  } catch {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
    })
    response.end("Not found")
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`FocoContext Admin Console listening on ${port}.`)
})
