export const supportedLanguages = ["zh-CN", "en-US"] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]

export const defaultLanguage: SupportedLanguage = "en-US"
export const languageStorageKey = "fococontext.admin.language"

interface InitialLanguageInput {
  browserLanguage?: string
  browserLanguages?: readonly string[]
  storedLanguage?: string
}

export function getInitialLanguage(
  input: InitialLanguageInput = {}
): SupportedLanguage {
  const storedLanguage = input.storedLanguage ?? readStoredLanguage()

  if (isSupportedLanguage(storedLanguage)) {
    return storedLanguage
  }

  return matchBrowserLanguage(
    input.browserLanguages ?? readBrowserLanguages(input.browserLanguage)
  )
}

export function isSupportedLanguage(
  value: string | undefined
): value is SupportedLanguage {
  return supportedLanguages.some((language) => language === value)
}

export function persistLanguage(language: SupportedLanguage) {
  getBrowserStorage()?.setItem(languageStorageKey, language)
}

function readStoredLanguage() {
  return getBrowserStorage()?.getItem(languageStorageKey) ?? undefined
}

function readBrowserLanguages(browserLanguage?: string) {
  if (browserLanguage !== undefined) {
    return [browserLanguage]
  }

  if (typeof window === "undefined") {
    return []
  }

  const languages = window.navigator.languages

  if (languages.length > 0) {
    return [...languages]
  }

  return window.navigator.language === "" ? [] : [window.navigator.language]
}

function getBrowserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  return typeof window === "undefined" ? null : window.localStorage
}

function matchBrowserLanguage(languages: readonly string[]): SupportedLanguage {
  for (const language of languages) {
    const normalizedLanguage = language.toLowerCase()

    if (normalizedLanguage.startsWith("zh")) {
      return "zh-CN"
    }

    if (normalizedLanguage.startsWith("en")) {
      return "en-US"
    }
  }

  return defaultLanguage
}
