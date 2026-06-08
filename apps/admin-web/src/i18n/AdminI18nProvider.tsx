import type { PropsWithChildren } from "react"
import { I18nextProvider } from "react-i18next"

import { adminI18n } from "@/i18n/i18n.js"

export function AdminI18nProvider({ children }: PropsWithChildren) {
  return <I18nextProvider i18n={adminI18n}>{children}</I18nextProvider>
}
