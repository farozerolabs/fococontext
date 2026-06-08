import { createContext, useContext } from "react"

import type { FococontextApiClient } from "@/api/fococontext-client.js"

export const ApiClientContext = createContext<FococontextApiClient | null>(null)

export function useApiClient() {
  const client = useContext(ApiClientContext)

  if (client === null) {
    throw new Error("Admin API client provider is missing.")
  }

  return client
}
