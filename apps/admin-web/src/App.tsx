import { RouterProvider } from "react-router/dom"

import { AdminApiProviders } from "@/api/AdminApiProviders.js"
import { adminRouter } from "@/app/router.js"
import { ThemeProvider } from "@/components/theme-provider.js"
import { ToastProvider } from "@/components/ui/toast.js"
import { TooltipProvider } from "@/components/ui/tooltip.js"
import { AdminI18nProvider } from "@/i18n/AdminI18nProvider.js"

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="fococontext.console.theme">
      <AdminI18nProvider>
        <AdminApiProviders>
          <TooltipProvider>
            <RouterProvider router={adminRouter} />
            <ToastProvider />
          </TooltipProvider>
        </AdminApiProviders>
      </AdminI18nProvider>
    </ThemeProvider>
  )
}

export default App
