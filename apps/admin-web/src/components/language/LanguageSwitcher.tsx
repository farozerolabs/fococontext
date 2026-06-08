import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js"
import {
  defaultLanguage,
  isSupportedLanguage,
  persistLanguage,
  type SupportedLanguage,
} from "@/i18n/languages.js"

interface LanguageSwitcherProps {
  dataTestId?: string
}

const languageLabels: Record<
  SupportedLanguage,
  "language.zhCN" | "language.enUS"
> = {
  "zh-CN": "language.zhCN",
  "en-US": "language.enUS",
}

export function LanguageSwitcher({ dataTestId }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation()
  const currentLanguage = isSupportedLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : defaultLanguage

  async function changeLanguage(language: SupportedLanguage) {
    persistLanguage(language)
    await i18n.changeLanguage(language)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("settings.language")}
          data-testid={dataTestId}
          size="sm"
          type="button"
          variant="outline"
        >
          {t(languageLabels[currentLanguage])}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        aria-label={t("settings.language")}
        role="listbox"
      >
        {supportedLanguageOptions.map((language) => (
          <DropdownMenuItem
            aria-selected={currentLanguage === language}
            key={language}
            onSelect={() => void changeLanguage(language)}
            role="option"
          >
            {t(languageLabels[language])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const supportedLanguageOptions: readonly SupportedLanguage[] = [
  "zh-CN",
  "en-US",
]
