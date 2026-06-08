import {
  createFococontextApiClient,
  type FococontextApiClientOptions,
} from "@/api/fococontext-client.js"
import {
  getAdminRuntimeConfig,
  resolveBrowserApiBaseUrl,
} from "@/app/runtime-config.js"
import { adminI18n } from "@/i18n/i18n.js"

export function createDefaultApiClient() {
  const runtimeConfig = getAdminRuntimeConfig()
  const baseUrl = resolveBrowserApiBaseUrl(
    runtimeConfig.apiBaseUrl ?? import.meta.env.VITE_FOCOCONTEXT_API_BASE_URL
  )
  const options: FococontextApiClientOptions =
    baseUrl === undefined
      ? {
          locale: () => adminI18n.resolvedLanguage,
        }
      : {
          baseUrl,
          locale: () => adminI18n.resolvedLanguage,
        }

  return createFococontextApiClient(options)
}
