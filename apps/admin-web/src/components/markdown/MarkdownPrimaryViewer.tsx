import { useTranslation } from "react-i18next"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js"
import { cn } from "@/lib/utils.js"

import { MarkdownRenderer } from "./MarkdownRenderer.js"

interface MarkdownPrimaryViewerProps {
  className?: string
  markdown: string
  resolveMedia?: (src: string) => string | undefined
  resolveWikilink?: (target: string, anchor: string | undefined) => string
  skipFirstHeading?: boolean
}

export function MarkdownPrimaryViewer({
  className,
  markdown,
  resolveMedia,
  resolveWikilink,
  skipFirstHeading,
}: MarkdownPrimaryViewerProps) {
  const { t } = useTranslation()

  return (
    <Tabs
      className={cn(
        "mx-auto flex w-full max-w-5xl flex-col gap-4 px-2 py-2 sm:px-6 sm:py-4 lg:px-10 lg:py-6",
        className
      )}
      defaultValue="preview"
    >
      <div className="flex justify-end">
        <TabsList
          aria-label={t("ide.markdownViewMode")}
          className="h-auto rounded-md"
        >
          <TabsTrigger value="raw">{t("ide.rawData")}</TabsTrigger>
          <TabsTrigger value="preview">{t("ide.preview")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="mt-0" value="preview">
        <MarkdownRenderer
          markdown={markdown}
          {...(resolveMedia === undefined ? {} : { resolveMedia })}
          {...(resolveWikilink === undefined ? {} : { resolveWikilink })}
          {...(skipFirstHeading === undefined ? {} : { skipFirstHeading })}
        />
      </TabsContent>
      <TabsContent className="mt-0" value="raw">
        <pre
          className="overflow-x-auto rounded-lg border bg-muted/30 p-4 text-sm leading-7"
          data-testid="raw-markdown-document"
        >
          <code className="break-words whitespace-pre-wrap">{markdown}</code>
        </pre>
      </TabsContent>
    </Tabs>
  )
}
