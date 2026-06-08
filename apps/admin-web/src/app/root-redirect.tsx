import { redirect } from "react-router"

import { createDefaultApiClient } from "@/api/default-client.js"
import {
  consoleAuthStorageKey,
  readConsoleAuthState,
} from "@/app/auth-state.js"
import {
  dashboardRoutePath,
  getRootRedirectTarget,
  loginRoutePath,
} from "@/app/route-paths.js"

export async function rootRedirectLoader() {
  if (!readConsoleAuthState()) {
    return redirect(getRootRedirectTarget(false))
  }

  const sessionIsValid = await verifyAdminSession()

  if (!sessionIsValid) {
    clearConsoleAuthState()

    return redirect(loginRoutePath)
  }

  return redirect(dashboardRoutePath)
}

async function verifyAdminSession() {
  try {
    const session = await createDefaultApiClient().getAdminSession()

    return session.authenticated
  } catch {
    return false
  }
}

function clearConsoleAuthState() {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(consoleAuthStorageKey)
}
