import type { PropsWithChildren } from "react"

import { Breadcrumbs } from "@/components/layout/Breadcrumbs.js"
import { Sidebar, type SidebarScope } from "@/components/layout/Sidebar.js"
import { LanguageSwitcher } from "@/components/language/LanguageSwitcher.js"
import { UserMenu } from "@/components/navigation/UserMenu.js"
import { Separator } from "@/components/ui/separator.js"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.js"

interface ConsoleLayoutProps extends PropsWithChildren {
  sidebarScope: SidebarScope
}

export function ConsoleLayout({ children, sidebarScope }: ConsoleLayoutProps) {
  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      data-app-shell="admin-console"
    >
      <Sidebar scope={sidebarScope} />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header
          className="flex h-14 min-w-0 shrink-0 items-center gap-2 border-b px-4 lg:px-6"
          data-testid="console-header"
        >
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="mx-2 data-[orientation=vertical]:h-4"
            orientation="vertical"
          />
          <Breadcrumbs />
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <LanguageSwitcher dataTestId="language-switcher" />
            <UserMenu />
          </div>
        </header>
        <div
          className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain pb-16 md:pb-0"
          data-testid="console-main-scroll"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
