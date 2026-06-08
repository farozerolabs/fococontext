import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import { useApiClient } from "@/api/api-client-context.js"
import { consoleAuthStorageKey } from "@/app/auth-state.js"
import { adminBrandLogoPath, adminBrandName } from "@/app/brand.js"
import { LanguageSwitcher } from "@/components/language/LanguageSwitcher.js"
import { Button } from "@/components/ui/button.js"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.js"
import { Input } from "@/components/ui/input.js"

export function LoginPage() {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const username = String(formData.get("username") ?? "")
    const password = String(formData.get("password") ?? "")

    setError(null)
    setIsSubmitting(true)

    try {
      await apiClient.loginAdmin({ password, username })
      window.localStorage.setItem(consoleAuthStorageKey, "true")
      navigate("/dashboard", { replace: true })
    } catch {
      window.localStorage.removeItem(consoleAuthStorageKey)
      setError(t("auth.invalidCredentials"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-foreground md:p-10"
      data-route-id="login"
      data-testid="login-05-layout"
    >
      <a
        className="absolute top-4 left-4 flex items-center gap-3 font-semibold md:top-6 md:left-6"
        href="/login"
      >
        <img
          alt=""
          aria-hidden="true"
          className="size-8 dark:invert"
          data-testid="brand-logo"
          src={adminBrandLogoPath}
        />
        <span className="text-lg">{adminBrandName}</span>
      </a>
      <div className="absolute top-4 right-4">
        <LanguageSwitcher dataTestId="language-switcher" />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-xl font-bold">{adminBrandName}</h1>
              <FieldDescription>{t("auth.signInDescription")}</FieldDescription>
            </div>
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor="admin-username">
                {t("auth.username")}
              </FieldLabel>
              <Input
                aria-invalid={error !== null}
                autoComplete="username"
                id="admin-username"
                name="username"
                required
              />
            </Field>
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor="admin-password">
                {t("auth.password")}
              </FieldLabel>
              <Input
                aria-invalid={error !== null}
                autoComplete="current-password"
                id="admin-password"
                name="password"
                required
                type="password"
              />
              {error === null ? null : <FieldError>{error}</FieldError>}
            </Field>
            <Field>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? t("status.running") : t("auth.signIn")}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </div>
    </main>
  )
}
