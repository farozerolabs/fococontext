import { createRequire } from "node:module";

import { defineConfig, type DefaultTheme } from "vitepress";

const require = createRequire(import.meta.url);
const manifest = require("./docs-manifest.json") as DocsManifest;

type LocaleId = "en-US" | "zh-CN";
type HeadEntry = [string, Record<string, string>];

interface DocsManifest {
  groups: DocsGroup[];
  locales: {
    id: LocaleId;
    label: string;
    lang: string;
  }[];
}

interface DocsGroup {
  id: "help" | "openapi";
  items: DocsItem[];
  title: Record<LocaleId, string>;
}

interface DocsItem {
  id: string;
  slug: string;
  title: Record<LocaleId, string>;
}

interface LocaleMetadata {
  description: string;
  keywords: string;
  ogLocale: string;
}

const defaultLocale: LocaleId = "en-US";
const docsBase = normalizeBase(process.env.DOCS_BASE);
const docsOrigin = normalizeOrigin(process.env.DOCS_SITE_URL ?? "https://docs.fococontext.com");
const docsPublicBaseUrl = createAbsoluteUrl(docsOrigin, docsBase, "/");
const logoPath = createPublicPath(docsBase, "/brand/fococontext-symbol.png");
const openGraphImageUrl = createAbsoluteUrl(docsOrigin, docsBase, "/og/og.png");
const twitterImageUrl = createAbsoluteUrl(docsOrigin, docsBase, "/og/x-og.png");
const siteName = "FocoContext Docs";
const siteTitle = "FocoContext Docs";
const twitterSite = "@FocoContext";
const localeMetadata: Record<LocaleId, LocaleMetadata> = {
  "en-US": {
    description: "Self-hostable Wiki-first knowledge infrastructure for developer products.",
    keywords:
      "FocoContext, LLM Wiki, knowledge base, developer API, self-hosted knowledge infrastructure, Wiki-first retrieval",
    ogLocale: "en_US",
  },
  "zh-CN": {
    description: "基于 LLM Wiki 理念的企业知识库系统。",
    keywords: "FocoContext, LLM Wiki, 企业知识库, 开发者 API, 自托管知识库, Wiki 优先检索",
    ogLocale: "zh_CN",
  },
};

export default defineConfig({
  base: docsBase,
  cleanUrls: true,
  description: localeMetadata[defaultLocale].description,
  head: [
    ["link", { href: logoPath, rel: "icon", sizes: "1000x1000", type: "image/png" }],
    ["meta", { content: "index, follow", name: "robots" }],
    ["meta", { content: "#0a0a0a", name: "theme-color" }],
    ["meta", { content: localeMetadata[defaultLocale].keywords, name: "keywords" }],
    ["meta", { content: "summary_large_image", name: "twitter:card" }],
    ["meta", { content: twitterSite, name: "twitter:site" }],
  ],
  lang: "en-US",
  lastUpdated: true,
  locales: {
    "en-US": {
      lang: "en-US",
      label: "English",
      themeConfig: {
        nav: createNav("en-US"),
      },
    },
    "zh-CN": {
      lang: "zh-CN",
      label: "简体中文",
      themeConfig: {
        nav: createNav("zh-CN"),
      },
    },
  },
  sitemap: {
    hostname: docsPublicBaseUrl,
  },
  title: siteTitle,
  titleTemplate: ":title | FocoContext",
  themeConfig: {
    logo: {
      alt: "FocoContext",
      src: logoPath,
    },
    nav: createNav(defaultLocale),
    search: {
      provider: "local",
    },
    sidebar: {
      "/en-US/": createSidebar("en-US"),
      "/zh-CN/": createSidebar("zh-CN"),
    },
    siteTitle,
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/farozerolabs/fococontext",
      },
    ],
  },
  transformHead(context) {
    return createPageHead(context.page, context.title, context.description);
  },
  transformPageData(pageData) {
    const locale = getLocaleFromPage(pageData.relativePath);
    pageData.description = localeMetadata[locale].description;
  },
});

function createNav(locale: LocaleId): DefaultTheme.NavItem[] {
  return manifest.groups.map((group) => ({
    link: createGroupLink(locale, group),
    text: group.title[locale],
  }));
}

function createSidebar(locale: LocaleId): DefaultTheme.SidebarItem[] {
  return manifest.groups.map((group) => ({
    items: group.items.map((item) => ({
      link: `/${locale}/${group.id}/${item.slug}`,
      text: item.title[locale],
    })),
    text: group.title[locale],
  }));
}

function createGroupLink(locale: LocaleId, group: DocsGroup) {
  const firstItem = group.items[0];

  if (firstItem === undefined) {
    return `/${locale}/`;
  }

  return `/${locale}/${group.id}/${firstItem.slug}`;
}

function normalizeBase(value: string | undefined) {
  const rawValue = value?.trim() || "/";

  if (rawValue === "/") {
    return "/";
  }

  return `/${rawValue.replace(/^\/+|\/+$/gu, "")}/`;
}

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/u, "");
}

function createPageHead(page: string, title: string, description: string): HeadEntry[] {
  const locale = getLocaleFromPage(page);
  const metadata = localeMetadata[locale];
  const pagePath = createPagePath(page);
  const canonicalUrl = createAbsoluteUrl(docsOrigin, docsBase, pagePath);
  const alternate = createAlternateLocale(page);
  const entries: HeadEntry[] = [
    ["link", { href: canonicalUrl, rel: "canonical" }],
    ["meta", { content: siteName, property: "og:site_name" }],
    ["meta", { content: title, property: "og:title" }],
    ["meta", { content: description || metadata.description, property: "og:description" }],
    ["meta", { content: "website", property: "og:type" }],
    ["meta", { content: canonicalUrl, property: "og:url" }],
    ["meta", { content: openGraphImageUrl, property: "og:image" }],
    ["meta", { content: "image/png", property: "og:image:type" }],
    ["meta", { content: "1200", property: "og:image:width" }],
    ["meta", { content: "630", property: "og:image:height" }],
    ["meta", { content: "FocoContext", property: "og:image:alt" }],
    ["meta", { content: metadata.ogLocale, property: "og:locale" }],
    ["meta", { content: twitterSite, name: "twitter:site" }],
    ["meta", { content: title, name: "twitter:title" }],
    ["meta", { content: description || metadata.description, name: "twitter:description" }],
    ["meta", { content: twitterImageUrl, name: "twitter:image" }],
    ["meta", { content: "FocoContext", name: "twitter:image:alt" }],
  ];

  if (alternate !== undefined) {
    entries.push([
      "link",
      {
        href: createAbsoluteUrl(docsOrigin, docsBase, alternate.path),
        hreflang: alternate.locale,
        rel: "alternate",
      },
    ]);
    entries.push([
      "meta",
      {
        content: localeMetadata[alternate.locale].ogLocale,
        property: "og:locale:alternate",
      },
    ]);
  }

  return entries;
}

function getLocaleFromPage(page: string): LocaleId {
  if (page.startsWith("zh-CN/")) {
    return "zh-CN";
  }

  return defaultLocale;
}

function createAlternateLocale(page: string):
  | {
      locale: LocaleId;
      path: string;
    }
  | undefined {
  if (page.startsWith("en-US/")) {
    return {
      locale: "zh-CN",
      path: createPagePath(page.replace(/^en-US\//u, "zh-CN/")),
    };
  }

  if (page.startsWith("zh-CN/")) {
    return {
      locale: "en-US",
      path: createPagePath(page.replace(/^zh-CN\//u, "en-US/")),
    };
  }

  return undefined;
}

function createPagePath(page: string) {
  const withoutExtension = page.replace(/\.md$/u, "");

  if (withoutExtension === "index") {
    return "/";
  }

  if (withoutExtension.endsWith("/index")) {
    return `/${withoutExtension.replace(/\/index$/u, "")}/`;
  }

  return `/${withoutExtension}`;
}

function createPublicPath(base: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base === "/") {
    return normalizedPath;
  }

  return `${base.replace(/\/$/u, "")}${normalizedPath}`;
}

function createAbsoluteUrl(origin: string, base: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const basePath = base === "/" ? "" : base.replace(/\/$/u, "");

  return new URL(`${basePath}${normalizedPath}`, `${origin}/`).toString();
}
