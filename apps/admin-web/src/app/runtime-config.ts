export interface AdminRuntimeConfig {
  adminBaseUrl?: string
  apiBaseUrl?: string
}

interface BrowserLocationLike {
  hostname: string
}

declare global {
  interface Window {
    __FOCOCONTEXT_RUNTIME_CONFIG__?: AdminRuntimeConfig
  }
}

export function getAdminRuntimeConfig(): AdminRuntimeConfig {
  if (typeof window === "undefined") {
    return {}
  }

  return window.__FOCOCONTEXT_RUNTIME_CONFIG__ ?? {}
}

export function resolveBrowserApiBaseUrl(
  apiBaseUrl: string | undefined,
  browserLocation: BrowserLocationLike | null = getBrowserLocation()
) {
  if (apiBaseUrl === undefined || browserLocation === null) {
    return apiBaseUrl
  }

  try {
    const url = new URL(apiBaseUrl)

    if (isLocalHost(url.hostname) && isLocalHost(browserLocation.hostname)) {
      url.hostname = browserLocation.hostname
      return url.toString().replace(/\/$/u, "")
    }
  } catch {
    return apiBaseUrl
  }

  return apiBaseUrl
}

function getBrowserLocation(): BrowserLocationLike | null {
  return typeof window === "undefined" ? null : window.location
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  )
}
