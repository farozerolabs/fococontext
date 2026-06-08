import {
  Activity,
  ArrowLeft,
  FileText,
  FileUp,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  LayoutDashboard,
  Search,
  Settings,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useParams } from "react-router"

import { adminBrandLogoPath, adminBrandName } from "@/app/brand.js"
import {
  createKnowledgeBaseWorkflowLinks,
  systemSettingsRoutePath,
  type KnowledgeBaseWorkflowLinkId,
} from "@/app/route-paths.js"
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar.js"
import { cn } from "@/lib/utils.js"

export type SidebarScope = "global" | "knowledge-base"

type GlobalSidebarItemId = "dashboard" | "settings"

export interface SidebarItem {
  activePathPrefix?: string
  href: string
  icon: typeof LayoutDashboard
  id: "backToDashboard" | GlobalSidebarItemId | KnowledgeBaseWorkflowLinkId
  labelKey: string
}

const workflowIcons: Record<
  KnowledgeBaseWorkflowLinkId,
  typeof LayoutDashboard
> = {
  forks: GitFork,
  graph: GitBranch,
  jobs: Activity,
  overview: LayoutDashboard,
  pages: FileText,
  retrieval: Search,
  settings: Settings,
  sources: FileUp,
  versions: GitCommitHorizontal,
}

export function createGlobalSidebarItems(): SidebarItem[] {
  return [
    {
      href: "/dashboard",
      icon: LayoutDashboard,
      id: "dashboard",
      labelKey: "nav.dashboard",
    },
    {
      href: systemSettingsRoutePath,
      icon: Settings,
      id: "settings",
      labelKey: "nav.settings",
    },
  ]
}

export function createKnowledgeBaseWorkspaceSidebarItems(
  knowledgeBaseId: string
): SidebarItem[] {
  return [
    {
      href: "/dashboard",
      icon: ArrowLeft,
      id: "backToDashboard",
      labelKey: "layout.backToDashboard",
    },
    ...createKnowledgeBaseWorkflowLinks(knowledgeBaseId).map((link) => ({
      href: link.path,
      icon: workflowIcons[link.id],
      id: link.id,
      labelKey: link.labelKey,
    })),
  ]
}

export function Sidebar({ scope }: { scope: SidebarScope }) {
  const { t } = useTranslation()
  const location = useLocation()
  const { knowledgeBaseId } = useParams()
  const items =
    scope === "knowledge-base" && knowledgeBaseId !== undefined
      ? createKnowledgeBaseWorkspaceSidebarItems(knowledgeBaseId)
      : createGlobalSidebarItems()
  const navigationLabel =
    scope === "knowledge-base"
      ? t("layout.knowledgeBaseNavigation")
      : t("layout.globalNavigation")

  return (
    <>
      <ShadcnSidebar collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="h-10"
                tooltip={adminBrandName}
              >
                <NavLink to="/dashboard">
                  <img
                    alt=""
                    aria-hidden="true"
                    className="size-5 dark:invert"
                    data-icon="inline-start"
                    data-testid="sidebar-brand-logo"
                    src={adminBrandLogoPath}
                  />
                  <span className="text-base font-semibold">
                    {adminBrandName}
                  </span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              {scope === "knowledge-base"
                ? t("nav.knowledgeBase")
                : t("nav.dashboard")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu aria-label={navigationLabel}>
                {items.map((item) =>
                  renderSidebarItem(item, t, location.pathname)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </ShadcnSidebar>
      <MobileNav
        items={items}
        label={navigationLabel}
        pathname={location.pathname}
        t={t}
      />
    </>
  )
}

function MobileNav({
  items,
  label,
  pathname,
  t,
}: {
  items: SidebarItem[]
  label: string
  pathname: string
  t: (key: string) => string
}) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t bg-background/95 p-1 backdrop-blur md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon
        const label = t(item.labelKey)
        const isActive = isSidebarItemActive(item, pathname)

        return (
          <NavLink
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-w-16 flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium",
              isActive ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
            key={item.id}
            to={item.href}
          >
            <Icon aria-hidden="true" data-icon="inline-start" />
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

function renderSidebarItem(
  item: SidebarItem,
  t: (key: string) => string,
  pathname: string
) {
  const Icon = item.icon
  const label = t(item.labelKey)
  const isActive = isSidebarItemActive(item, pathname)

  return (
    <SidebarMenuItem key={item.id}>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <NavLink to={item.href}>
          <Icon aria-hidden="true" data-icon="inline-start" />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function isSidebarItemActive(item: SidebarItem, pathname: string) {
  return (
    pathname === item.href ||
    (item.activePathPrefix !== undefined &&
      pathname.startsWith(item.activePathPrefix))
  )
}
