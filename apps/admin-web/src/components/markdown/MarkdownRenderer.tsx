import { useEffect, useId, useMemo, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { cn } from "@/lib/utils.js"

import { sanitizeMarkdownHref } from "./markdown-security.js"

import "katex/dist/katex.min.css"

interface MarkdownRendererProps {
  className?: string
  markdown: string
  resolveMedia?: (src: string) => string | undefined
  resolveWikilink?: (target: string, anchor: string | undefined) => string
  skipFirstHeading?: boolean
  variant?: "default" | "docs"
}

type MarkdownBlock =
  | {
      content: string
      kind: "code"
      language: string
    }
  | {
      content: string
      kind: "heading"
      level: 1 | 2 | 3
    }
  | {
      content: string[]
      kind: "list"
      ordered: boolean
    }
  | {
      content: string
      kind: "paragraph" | "quote"
    }

interface MermaidRuntime {
  initialize: (config: {
    securityLevel: "strict"
    startOnLoad: boolean
    theme: "default"
  }) => void
  render: (id: string, code: string) => Promise<{ svg: string }>
}

declare global {
  interface Window {
    mermaid?: MermaidRuntime
  }
}

let mermaidRuntimePromise: Promise<MermaidRuntime> | undefined

export function MarkdownRenderer({
  className,
  markdown,
  resolveMedia,
  resolveWikilink,
  skipFirstHeading = false,
  variant = "default",
}: MarkdownRendererProps) {
  const isDocsVariant = variant === "docs"
  const preparedMarkdown = useMemo(() => {
    const source = skipFirstHeading
      ? removeFirstMarkdownHeading(markdown)
      : markdown

    return convertWikilinksToMarkdownLinks(source)
  }, [markdown, skipFirstHeading])

  return (
    <article
      className={cn(
        "markdown-document flex flex-col",
        isDocsVariant ? "gap-6" : "gap-5",
        className
      )}
      data-testid="markdown-document"
    >
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <MarkdownLink
              {...(href === undefined ? {} : { href })}
              {...(resolveWikilink === undefined ? {} : { resolveWikilink })}
            >
              {children}
            </MarkdownLink>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={cn(
                "border-l-2 pl-4 text-muted-foreground",
                isDocsVariant ? "text-base leading-8" : "text-sm leading-7"
              )}
            >
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const language = readCodeLanguage(className)
            const code = String(children).replace(/\n$/u, "")

            if (language === "mermaid") {
              return <MermaidBlock code={code} />
            }

            return (
              <code
                className={
                  language === null
                    ? "rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-medium"
                    : undefined
                }
              >
                {children}
              </code>
            )
          },
          h1: ({ children }) => (
            <h1
              className={cn(
                "font-semibold tracking-normal",
                isDocsVariant ? "text-3xl" : "text-2xl"
              )}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className={cn(
                "font-semibold tracking-normal",
                isDocsVariant
                  ? "mt-4 scroll-m-20 text-2xl"
                  : "border-t pt-5 text-lg"
              )}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className={cn(
                "font-semibold tracking-normal",
                isDocsVariant ? "text-xl" : "text-base"
              )}
            >
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-lg font-semibold tracking-normal">
              {children}
            </h4>
          ),
          img: ({ alt, src }) => (
            <img
              alt={alt ?? ""}
              className="max-h-[32rem] max-w-full rounded-lg border object-contain"
              src={resolveMarkdownImageSource(src, resolveMedia)}
            />
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          ol: ({ children }) => (
            <ol
              className={cn(
                "flex list-decimal flex-col gap-2 pl-5 text-foreground",
                isDocsVariant ? "text-base leading-8" : "text-sm leading-7"
              )}
            >
              {children}
            </ol>
          ),
          p: ({ children }) => (
            <p
              className={cn(
                "text-foreground",
                isDocsVariant ? "text-base leading-8" : "text-sm leading-7"
              )}
            >
              {children}
            </p>
          ),
          pre: ({ children }) => (
            <pre
              className={cn(
                "overflow-x-auto rounded-lg border bg-muted text-sm leading-relaxed",
                isDocsVariant ? "p-5" : "p-4"
              )}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          td: ({ children }) => (
            <td className="border-t px-3 py-2 align-top">{children}</td>
          ),
          th: ({ children }) => (
            <th className="bg-muted px-3 py-2 text-left font-medium">
              {children}
            </th>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tr: ({ children }) => <tr>{children}</tr>,
          ul: ({ children }) => (
            <ul
              className={cn(
                "flex list-disc flex-col gap-2 pl-5 text-foreground",
                isDocsVariant ? "text-base leading-8" : "text-sm leading-7"
              )}
            >
              {children}
            </ul>
          ),
        }}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {preparedMarkdown}
      </ReactMarkdown>
    </article>
  )
}

function MarkdownLink({
  children,
  href,
  resolveWikilink,
}: {
  children: ReactNode
  href?: string
  resolveWikilink?: (target: string, anchor: string | undefined) => string
}) {
  const wikiTarget = readWikilinkHref(href)
  const resolvedHref =
    wikiTarget === null
      ? sanitizeMarkdownHref(href ?? "#")
      : (resolveWikilink?.(wikiTarget.target, wikiTarget.anchor) ?? "#")
  const isExternal =
    resolvedHref.startsWith("http://") || resolvedHref.startsWith("https://")

  return (
    <a
      className="font-medium text-foreground underline underline-offset-4"
      href={resolvedHref}
      rel={isExternal ? "noopener noreferrer" : undefined}
      target={isExternal ? "_blank" : undefined}
    >
      {children}
    </a>
  )
}

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replaceAll(":", "")
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function renderMermaid() {
      try {
        const mermaid = await loadMermaidRuntime()

        mermaid.initialize({
          securityLevel: "strict",
          startOnLoad: false,
          theme: "default",
        })

        const result = await mermaid.render(`mermaid-${id}`, code)

        if (!cancelled) {
          setSvg(result.svg)
          setFailed(false)
        }
      } catch {
        if (!cancelled) {
          setFailed(true)
        }
      }
    }

    void renderMermaid()

    return () => {
      cancelled = true
    }
  }, [code, id])

  if (failed || svg === null) {
    return <code>{code}</code>
  }

  return (
    <div
      className="overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function loadMermaidRuntime(): Promise<MermaidRuntime> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Mermaid runtime requires a browser window.")
    )
  }

  if (window.mermaid !== undefined) {
    return Promise.resolve(window.mermaid)
  }

  mermaidRuntimePromise ??= new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-fococontext-mermaid="true"]'
    )

    if (existingScript !== null) {
      existingScript.addEventListener("load", () => {
        if (window.mermaid === undefined) {
          reject(new Error("Mermaid runtime did not initialize."))
          return
        }

        resolve(window.mermaid)
      })
      existingScript.addEventListener("error", () => {
        reject(new Error("Mermaid runtime failed to load."))
      })
      return
    }

    const script = document.createElement("script")
    script.async = true
    script.dataset.fococontextMermaid = "true"
    script.src = "/vendor/mermaid.min.js"
    script.addEventListener("load", () => {
      if (window.mermaid === undefined) {
        reject(new Error("Mermaid runtime did not initialize."))
        return
      }

      resolve(window.mermaid)
    })
    script.addEventListener("error", () => {
      reject(new Error("Mermaid runtime failed to load."))
    })
    document.head.append(script)
  })

  return mermaidRuntimePromise
}

function removeFirstMarkdownHeading(markdown: string): string {
  return markdown.replace(/^\s*#\s+.+?(?:\n+|$)/u, "")
}

function convertWikilinksToMarkdownLinks(markdown: string): string {
  return markdown.replace(
    /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/gu,
    (
      _match,
      rawTarget: string,
      rawAnchor: string | undefined,
      rawLabel: string | undefined
    ) => {
      const target = rawTarget.trim()
      const anchor = rawAnchor?.trim()
      const label = rawLabel?.trim() ?? target
      const href = `fococontext-wiki:${encodeURIComponent(target)}${
        anchor === undefined ? "" : `#${encodeURIComponent(anchor)}`
      }`

      return `[${label}](${href})`
    }
  )
}

function readWikilinkHref(
  href: string | undefined
): { anchor?: string; target: string } | null {
  if (href?.startsWith("fococontext-wiki:") !== true) {
    return null
  }

  const value = href.slice("fococontext-wiki:".length)
  const [rawTarget = "", rawAnchor] = value.split("#")
  const result: { anchor?: string; target: string } = {
    target: decodeURIComponent(rawTarget),
  }

  if (rawAnchor !== undefined && rawAnchor.length > 0) {
    result.anchor = decodeURIComponent(rawAnchor)
  }

  return result
}

function readCodeLanguage(className: string | undefined): string | null {
  return className?.match(/language-([\w-]+)/u)?.[1] ?? null
}

function resolveMarkdownImageSource(
  src: string | undefined,
  resolveMedia: ((src: string) => string | undefined) | undefined
): string {
  if (src === undefined) {
    return "#"
  }

  return sanitizeMarkdownHref(resolveMedia?.(src) ?? src)
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ""

    if (line.trim().length === 0) {
      index += 1
      continue
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      index += 1

      while (index < lines.length && !lines[index]?.startsWith("```")) {
        codeLines.push(lines[index] ?? "")
        index += 1
      }

      if (index < lines.length) {
        index += 1
      }

      blocks.push({
        content: codeLines.join("\n"),
        kind: "code",
        language,
      })
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/u.exec(line)

    if (heading !== null) {
      const marker = heading[1] ?? "#"

      blocks.push({
        content: (heading[2] ?? "").trim(),
        kind: "heading",
        level: marker.length as 1 | 2 | 3,
      })
      index += 1
      continue
    }

    const unorderedItem = /^-\s+(.+)$/u.exec(line)
    const orderedItem = /^\d+\.\s+(.+)$/u.exec(line)

    if (unorderedItem !== null || orderedItem !== null) {
      const ordered = orderedItem !== null
      const items: string[] = []

      while (index < lines.length) {
        const currentLine = lines[index] ?? ""
        const match = ordered
          ? /^\d+\.\s+(.+)$/u.exec(currentLine)
          : /^-\s+(.+)$/u.exec(currentLine)

        if (match === null) {
          break
        }

        items.push((match[1] ?? "").trim())
        index += 1
      }

      blocks.push({
        content: items,
        kind: "list",
        ordered,
      })
      continue
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = []

      while (index < lines.length && lines[index]?.startsWith(">") === true) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/u, ""))
        index += 1
      }

      blocks.push({
        content: quoteLines.join(" "),
        kind: "quote",
      })
      continue
    }

    const paragraphLines: string[] = []

    while (index < lines.length && isParagraphLine(lines[index] ?? "")) {
      paragraphLines.push((lines[index] ?? "").trim())
      index += 1
    }

    blocks.push({
      content: paragraphLines.join(" "),
      kind: "paragraph",
    })
  }

  return blocks
}

function isParagraphLine(line: string) {
  return (
    line.trim().length > 0 &&
    !line.startsWith("```") &&
    !/^(#{1,3})\s+.+$/u.test(line) &&
    !/^-\s+.+$/u.test(line) &&
    !/^\d+\.\s+.+$/u.test(line) &&
    !line.startsWith(">")
  )
}
