import i18next from "i18next"
import { initReactI18next } from "react-i18next"

import { getInitialLanguage } from "@/i18n/languages.js"
import { enUSMessages } from "@/i18n/resources/en-US.js"
import { zhCNMessages } from "@/i18n/resources/zh-CN.js"

export const i18nResources = {
  "zh-CN": {
    translation: zhCNMessages,
  },
  "en-US": {
    translation: enUSMessages,
  },
} as const

export function createAdminI18n() {
  const instance = i18next.createInstance()

  void instance.use(initReactI18next).init({
    fallbackLng: "zh-CN",
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    lng: getInitialLanguage(),
    react: {
      useSuspense: false,
    },
    resources: i18nResources,
    supportedLngs: ["zh-CN", "en-US"],
  })

  return instance
}

export const adminI18n = createAdminI18n()
