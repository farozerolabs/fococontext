import { QueryClientProvider } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"

import { ApiClientContext } from "@/api/api-client-context.js"
import { createDefaultApiClient } from "@/api/default-client.js"
import { adminQueryClient } from "@/api/query-client.js"

const apiClient = createDefaultApiClient()

export function AdminApiProviders({ children }: PropsWithChildren) {
  return (
    <ApiClientContext.Provider value={apiClient}>
      <QueryClientProvider client={adminQueryClient}>
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>
  )
}
