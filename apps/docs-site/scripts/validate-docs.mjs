import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docsSiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = join(docsSiteRoot, "docs");
const publicRoot = join(docsRoot, "public");
const outputRoot = join(docsRoot, ".vitepress", "dist");
const manifestPath = join(docsRoot, ".vitepress", "docs-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];

const expectedMarkdownFiles = new Set([
  join(docsRoot, "index.md"),
  ...manifest.locales.map((locale) => join(docsRoot, locale.id, "index.md")),
]);

validateManifest();
validateContentFiles();
validateNoOpenApiJson(docsRoot);
validateNoOpenApiJson(outputRoot);
validateInternalLinks();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }

  process.exit(1);
}

console.log("Docs validation passed.");

function validateManifest() {
  const localeIds = manifest.locales.map((locale) => locale.id);
  const uniqueLocaleIds = new Set(localeIds);

  if (uniqueLocaleIds.size !== localeIds.length) {
    failures.push("Manifest contains duplicate locale ids.");
  }

  for (const requiredLocale of ["en-US", "zh-CN"]) {
    if (!uniqueLocaleIds.has(requiredLocale)) {
      failures.push(`Manifest is missing required locale: ${requiredLocale}`);
    }
  }

  const documentIds = new Set();

  for (const group of manifest.groups) {
    if (!["help", "openapi"].includes(group.id)) {
      failures.push(`Unsupported documentation group: ${group.id}`);
    }

    for (const locale of manifest.locales) {
      if (typeof group.title?.[locale.id] !== "string") {
        failures.push(`Group ${group.id} is missing title for ${locale.id}.`);
      }
    }

    for (const item of group.items) {
      if (documentIds.has(item.id)) {
        failures.push(`Duplicate documentation id: ${item.id}`);
      }

      documentIds.add(item.id);

      if (!/^[a-z0-9-]+$/u.test(item.slug)) {
        failures.push(`Invalid documentation slug for ${item.id}: ${item.slug}`);
      }

      for (const locale of manifest.locales) {
        if (typeof item.title?.[locale.id] !== "string") {
          failures.push(`Document ${item.id} is missing title for ${locale.id}.`);
        }
      }
    }
  }
}

function validateContentFiles() {
  for (const locale of manifest.locales) {
    for (const group of manifest.groups) {
      for (const item of group.items) {
        const markdownPath = getMarkdownPath(locale.id, group.id, item.slug);
        expectedMarkdownFiles.add(markdownPath);

        if (!existsSync(markdownPath)) {
          failures.push(`Missing Markdown source: ${markdownPath}`);
          continue;
        }

        const markdown = readFileSync(markdownPath, "utf8");

        if (!/^#\s+/u.test(markdown)) {
          failures.push(`Markdown source must start with an H1: ${markdownPath}`);
        }
      }
    }
  }
}

function validateNoOpenApiJson(root) {
  if (!existsSync(root)) {
    return;
  }

  for (const filePath of listFiles(root)) {
    if (basename(filePath).toLowerCase() === "openapi.json") {
      failures.push(`Static docs must not publish openapi.json: ${filePath}`);
    }
  }
}

function validateInternalLinks() {
  for (const markdownPath of expectedMarkdownFiles) {
    if (!existsSync(markdownPath)) {
      continue;
    }

    const markdown = stripCodeFences(readFileSync(markdownPath, "utf8"));
    const linkPattern = /\[[^\]]+\]\(([^)]+)\)|href=["']([^"']+)["']/gu;

    for (const match of markdown.matchAll(linkPattern)) {
      const href = match[1] ?? match[2];

      if (href === undefined || shouldSkipLink(href)) {
        continue;
      }

      const targetPath = resolveLink(markdownPath, href);

      if (!existsSync(targetPath)) {
        failures.push(`Broken internal link in ${markdownPath}: ${href}`);
      }
    }
  }
}

function getMarkdownPath(localeId, groupId, slug) {
  return join(docsRoot, localeId, groupId, `${slug}.md`);
}

function listFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(root, entry.name);

    if (entry.isDirectory()) {
      return listFiles(absolutePath);
    }

    if (entry.isFile()) {
      return [absolutePath];
    }

    return [];
  });
}

function stripCodeFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/gu, "");
}

function shouldSkipLink(href) {
  return (
    href.startsWith("#") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("ftp://") ||
    href.startsWith("{") ||
    href.includes("<")
  );
}

function resolveLink(markdownPath, href) {
  const cleanHref = href.split("#", 1)[0]?.split("?", 1)[0] ?? href;

  if (cleanHref.startsWith("/")) {
    const markdownCandidate = resolve(docsRoot, `.${cleanHref}`);

    if (existsSync(markdownCandidate)) {
      return markdownCandidate;
    }

    return resolve(publicRoot, `.${cleanHref}`);
  }

  const rawTarget = resolve(dirname(markdownPath), cleanHref);

  if (extname(rawTarget) !== "") {
    return normalize(rawTarget);
  }

  const markdownTarget = `${rawTarget}.md`;

  if (existsSync(markdownTarget)) {
    return markdownTarget;
  }

  if (existsSync(rawTarget) && statSync(rawTarget).isDirectory()) {
    return join(rawTarget, "index.md");
  }

  return markdownTarget;
}
