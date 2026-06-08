import { lazy, Suspense, type ReactNode } from "react"
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from "react-router"
import { useTranslation } from "react-i18next"

import { readConsoleAuthState } from "@/app/auth-state.js"
import { RouteRobotsMeta } from "@/app/RouteRobotsMeta.js"
import { rootRedirectLoader } from "@/app/root-redirect.js"
import {
  dashboardRoutePath,
  knowledgeBaseRoutePaths,
  loginRoutePath,
  rootRoutePath,
  systemSettingsRoutePath,
} from "@/app/route-paths.js"
import { ConsoleLayout } from "@/components/layout/ConsoleLayout.js"
import { LoadingState } from "@/components/state/LoadingState.js"

const DashboardPage = lazy(async () => ({
  default: (await import("@/pages/DashboardPage.js")).DashboardPage,
}))
const KnowledgeBaseGraphPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseGraphPage.js"))
    .KnowledgeBaseGraphPage,
}))
const KnowledgeBaseForksPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseForksPage.js"))
    .KnowledgeBaseForksPage,
}))
const KnowledgeBaseJobsPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseJobsPage.js"))
    .KnowledgeBaseJobsPage,
}))
const KnowledgeBaseOverviewPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseOverviewPage.js"))
    .KnowledgeBaseOverviewPage,
}))
const KnowledgeBasePagesPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBasePagesPage.js"))
    .KnowledgeBasePagesPage,
}))
const KnowledgeBaseRetrievalPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseRetrievalPage.js"))
    .KnowledgeBaseRetrievalPage,
}))
const KnowledgeBaseSettingsPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseSettingsPage.js"))
    .KnowledgeBaseSettingsPage,
}))
const KnowledgeBaseSourcesPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseSourcesPage.js"))
    .KnowledgeBaseSourcesPage,
}))
const KnowledgeBaseVersionsPage = lazy(async () => ({
  default: (await import("@/pages/KnowledgeBaseVersionsPage.js"))
    .KnowledgeBaseVersionsPage,
}))
const LoginPage = lazy(async () => ({
  default: (await import("@/pages/LoginPage.js")).LoginPage,
}))
const SystemSettingsPage = lazy(async () => ({
  default: (await import("@/pages/SystemSettingsPage.js")).SystemSettingsPage,
}))

const [
  knowledgeBaseOverviewPath,
  knowledgeBaseSourcesPath,
  knowledgeBaseJobsPath,
  knowledgeBasePagesPath,
  knowledgeBaseGraphPath,
  knowledgeBaseVersionsPath,
  knowledgeBaseForksPath,
  knowledgeBaseRetrievalPath,
  knowledgeBaseSettingsPath,
] = knowledgeBaseRoutePaths

export const adminRoutes = [
  {
    path: rootRoutePath,
    loader: rootRedirectLoader,
    element: null,
  },
  {
    path: loginRoutePath,
    element: (
      <LazyRoute>
        <LoginPage />
      </LazyRoute>
    ),
  },
  {
    element: <GlobalConsoleRouteShell />,
    children: [
      {
        path: dashboardRoutePath,
        element: (
          <LazyRoute>
            <DashboardPage />
          </LazyRoute>
        ),
      },
      {
        path: systemSettingsRoutePath,
        element: (
          <LazyRoute>
            <SystemSettingsPage />
          </LazyRoute>
        ),
      },
    ],
  },
  {
    element: <KnowledgeBaseConsoleRouteShell />,
    children: [
      {
        path: knowledgeBaseOverviewPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseOverviewPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBaseSourcesPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseSourcesPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBaseJobsPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseJobsPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBasePagesPath,
        element: (
          <LazyRoute>
            <KnowledgeBasePagesPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBaseGraphPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseGraphPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBaseVersionsPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseVersionsPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBaseForksPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseForksPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBaseRetrievalPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseRetrievalPage />
          </LazyRoute>
        ),
      },
      {
        path: knowledgeBaseSettingsPath,
        element: (
          <LazyRoute>
            <KnowledgeBaseSettingsPage />
          </LazyRoute>
        ),
      },
    ],
  },
  {
    path: "*",
    element: <Navigate replace to={rootRoutePath} />,
  },
] satisfies RouteObject[]

export const adminRouter = createBrowserRouter(adminRoutes)

function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <>
      <RouteRobotsMeta />
      <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>
    </>
  )
}

function RouteLoadingFallback() {
  const { t } = useTranslation()

  return (
    <div className="p-6">
      <LoadingState label={t("state.loading")} />
    </div>
  )
}

function GlobalConsoleRouteShell() {
  if (!readConsoleAuthState()) {
    return (
      <>
        <RouteRobotsMeta />
        <Navigate replace to={loginRoutePath} />
      </>
    )
  }

  return (
    <>
      <RouteRobotsMeta />
      <ConsoleLayout sidebarScope="global">
        <Outlet />
      </ConsoleLayout>
    </>
  )
}

function KnowledgeBaseConsoleRouteShell() {
  if (!readConsoleAuthState()) {
    return (
      <>
        <RouteRobotsMeta />
        <Navigate replace to={loginRoutePath} />
      </>
    )
  }

  return (
    <>
      <RouteRobotsMeta />
      <ConsoleLayout sidebarScope="knowledge-base">
        <Outlet />
      </ConsoleLayout>
    </>
  )
}
