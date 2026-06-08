import { LogOut, UserRound } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import { useApiClient } from "@/api/api-client-context.js"
import { consoleAuthStorageKey } from "@/app/auth-state.js"
import { Button } from "@/components/ui/button.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js"

export function UserMenu() {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      await apiClient.logoutAdmin()
    } finally {
      window.localStorage.removeItem(consoleAuthStorageKey)
      setIsSigningOut(false)
      navigate("/login", { replace: true })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <UserRound aria-hidden="true" data-icon="inline-start" />
          <span>{t("layout.admin")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("layout.admin")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={isSigningOut}
            onSelect={(event) => {
              event.preventDefault()
              void handleSignOut()
            }}
          >
            <LogOut aria-hidden="true" data-icon="inline-start" />
            {t("auth.signOut")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
