export const consoleAuthStorageKey = "fococontext.console.authenticated"

type ConsoleAuthStorage = Pick<Storage, "getItem">

export function readConsoleAuthState(
  storage: ConsoleAuthStorage | null = getBrowserStorage()
) {
  return storage?.getItem(consoleAuthStorageKey) === "true"
}

function getBrowserStorage(): ConsoleAuthStorage | null {
  return typeof window === "undefined" ? null : window.localStorage
}
