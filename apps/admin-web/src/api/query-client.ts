import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

import { ApiClientError } from "@/api/fococontext-client.js"
import { consoleAuthStorageKey } from "@/app/auth-state.js"
import { showToast } from "@/components/ui/toast.js"
import { adminI18n } from "@/i18n/i18n.js"

export function createAdminQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: handleAdminRequestError,
    }),
    queryCache: new QueryCache({
      onError: handleAdminRequestError,
    }),
  })
}

export const adminQueryClient = createAdminQueryClient()

export function handleAdminAuthError(error: unknown) {
  if (
    !(error instanceof ApiClientError) ||
    error.status !== 401 ||
    typeof window === "undefined"
  ) {
    return
  }

  window.localStorage.removeItem(consoleAuthStorageKey)

  if (window.location.pathname !== "/login") {
    window.location.assign("/login")
  }
}

export function handleAdminRequestError(error: unknown) {
  showToast({
    message: getAdminRequestErrorMessage(error),
    variant: "error",
  })
  handleAdminAuthError(error)
  handleAdminStaleResourceError(error)
}

function getAdminRequestErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.isStaleResource) {
    return adminI18n.t("cleanup.staleResource")
  }

  if (error instanceof ApiClientError) {
    if (
      error.locale === adminI18n.resolvedLanguage &&
      error.message.trim().length > 0
    ) {
      return error.message
    }

    if (error.code !== null) {
      const localizedMessage = adminI18n.t(`apiError.${error.code}`, {
        defaultValue: "",
      })

      if (localizedMessage.trim().length > 0) {
        return localizedMessage
      }
    }

    if (error.message.trim().length > 0) {
      return error.message
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return adminI18n.t("toast.requestFailed")
}

export function handleAdminStaleResourceError(error: unknown) {
  if (!(error instanceof ApiClientError) || !error.isStaleResource) {
    return
  }

  void adminQueryClient.invalidateQueries({
    queryKey: ["knowledge-bases"],
  })
  void adminQueryClient.invalidateQueries({
    queryKey: ["cleanup-operations"],
  })

  if (
    typeof window !== "undefined" &&
    error.staleResource?.target_type === "knowledge_base" &&
    window.location.pathname !== "/dashboard"
  ) {
    window.location.assign("/dashboard")
  }
}
