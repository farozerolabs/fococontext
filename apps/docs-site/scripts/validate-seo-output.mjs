import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";

const docsSiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(docsSiteRoot, "../..");
const docsRoot = join(docsSiteRoot, "docs");
const publicRoot = join(docsRoot, "public");
const outputRoot = join(docsRoot, ".vitepress", "dist");
const adminLogoPath = join(repoRoot, "apps/admin-web/public/brand/fococontext-symbol.png");
const adminOpenGraphImagePath = join(repoRoot, "apps/admin-web/public/og/og.png");
const adminTwitterImagePath = join(repoRoot, "apps/admin-web/public/og/x-og.png");
const docsLogoPath = join(publicRoot, "brand/fococontext-symbol.png");
const outputLogoPath = join(outputRoot, "brand/fococontext-symbol.png");
const openGraphImagePath = join(publicRoot, "og/og.png");
const outputOpenGraphImagePath = join(outputRoot, "og/og.png");
const twitterImagePath = join(publicRoot, "og/x-og.png");
const outputTwitterImagePath = join(outputRoot, "og/x-og.png");

const docsOrigin = normalizeOrigin(process.env.DOCS_SITE_URL ?? "https://docs.fococontext.com");
const docsBase = normalizeBase(process.env.DOCS_BASE);
const openGraphImageUrl = createAbsoluteUrl(docsOrigin, docsBase, "/og/og.png");
const twitterImageUrl = createAbsoluteUrl(docsOrigin, docsBase, "/og/x-og.png");
const logoPublicPath = createPublicPath(docsBase, "/brand/fococontext-symbol.png");
const twitterSite = "@FocoContext";

const failures = [];

validateBuiltOutputExists();
validateBrandAssets();
validateSocialImages();
validateHtmlPage({
  alternateHrefLang: "zh-CN",
  alternatePath: "/zh-CN/",
  canonicalPath: "/en-US/",
  expectedDescription: "Self-hostable Wiki-first knowledge infrastructure for developer products.",
  expectedHtmlLang: "en-US",
  expectedLocale: "en_US",
  filePath: join(outputRoot, "en-US/index.html"),
});
validateHtmlPage({
  alternateHrefLang: "en-US",
  alternatePath: "/en-US/",
  canonicalPath: "/zh-CN/",
  expectedDescription: "基于 LLM Wiki 理念的企业知识库系统。",
  expectedHtmlLang: "zh-CN",
  expectedLocale: "zh_CN",
  filePath: join(outputRoot, "zh-CN/index.html"),
});
validateHtmlPage({
  canonicalPath: "/",
  expectedDescription: "Self-hostable Wiki-first knowledge infrastructure for developer products.",
  expectedHtmlLang: "en-US",
  expectedLocale: "en_US",
  filePath: join(outputRoot, "index.html"),
});
validateSitemap();
validateNoOpenApiJson();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }

  process.exit(1);
}

console.log("Docs SEO validation passed.");

function validateBuiltOutputExists() {
  if (!existsSync(outputRoot)) {
    failures.push(`Docs build output is missing: ${outputRoot}`);
  }
}

function validateBrandAssets() {
  validateFileExists(adminLogoPath, "Admin Console logo asset is missing");
  validateFileExists(docsLogoPath, "Docs logo asset is missing");
  validateFileExists(outputLogoPath, "Built docs logo asset is missing");

  if (!existsSync(adminLogoPath) || !existsSync(docsLogoPath)) {
    return;
  }

  const adminLogo = readFileSync(adminLogoPath);
  const docsLogo = readFileSync(docsLogoPath);
  const dimensions = readPngDimensions(docsLogoPath);
  const sizeBytes = statSync(docsLogoPath).size;

  if (!adminLogo.equals(docsLogo)) {
    failures.push("Docs logo PNG must remain byte-equivalent to the Admin Console logo PNG.");
  }

  if (dimensions.width !== 1000 || dimensions.height !== 1000) {
    failures.push(
      `Docs logo PNG must be 1000x1000. Found ${dimensions.width}x${dimensions.height}.`,
    );
  }

  if (sizeBytes > 128 * 1024) {
    failures.push(`Docs logo PNG should be 128 KiB or smaller. Found ${sizeBytes} bytes.`);
  }
}

function validateSocialImages() {
  validateFileExists(adminOpenGraphImagePath, "Admin Console Open Graph image is missing");
  validateFileExists(adminTwitterImagePath, "Admin Console Twitter image is missing");
  validateFileExists(openGraphImagePath, "Docs Open Graph image is missing");
  validateFileExists(outputOpenGraphImagePath, "Built docs Open Graph image is missing");
  validateFileExists(twitterImagePath, "Docs Twitter image is missing");
  validateFileExists(outputTwitterImagePath, "Built docs Twitter image is missing");

  if (
    !existsSync(adminOpenGraphImagePath) ||
    !existsSync(adminTwitterImagePath) ||
    !existsSync(openGraphImagePath) ||
    !existsSync(twitterImagePath)
  ) {
    return;
  }

  const adminOpenGraphImage = readFileSync(adminOpenGraphImagePath);
  const docsOpenGraphImage = readFileSync(openGraphImagePath);
  const adminTwitterImage = readFileSync(adminTwitterImagePath);
  const docsTwitterImage = readFileSync(twitterImagePath);
  const openGraphDimensions = readPngDimensions(openGraphImagePath);
  const twitterDimensions = readPngDimensions(twitterImagePath);
  const openGraphSizeBytes = statSync(openGraphImagePath).size;
  const twitterSizeBytes = statSync(twitterImagePath).size;

  if (!adminOpenGraphImage.equals(docsOpenGraphImage)) {
    failures.push("Docs Open Graph image must remain byte-equivalent to the Admin Console image.");
  }

  if (!adminTwitterImage.equals(docsTwitterImage)) {
    failures.push("Docs Twitter image must remain byte-equivalent to the Admin Console image.");
  }

  if (openGraphDimensions.width !== 1200 || openGraphDimensions.height !== 630) {
    failures.push(
      `Open Graph image must be 1200x630. Found ${openGraphDimensions.width}x${openGraphDimensions.height}.`,
    );
  }

  if (twitterDimensions.width !== 1500 || twitterDimensions.height !== 500) {
    failures.push(
      `Twitter image must be 1500x500. Found ${twitterDimensions.width}x${twitterDimensions.height}.`,
    );
  }

  if (openGraphSizeBytes > 2 * 1024 * 1024) {
    failures.push(
      `Open Graph image should be 2 MiB or smaller. Found ${openGraphSizeBytes} bytes.`,
    );
  }

  if (twitterSizeBytes > 2 * 1024 * 1024) {
    failures.push(`Twitter image should be 2 MiB or smaller. Found ${twitterSizeBytes} bytes.`);
  }
}

function validateHtmlPage({
  alternateHrefLang,
  alternatePath,
  canonicalPath,
  expectedDescription,
  expectedHtmlLang,
  expectedLocale,
  filePath,
}) {
  if (!existsSync(filePath)) {
    failures.push(`Generated HTML page is missing: ${filePath}`);
    return;
  }

  const html = readFileSync(filePath, "utf8");
  const canonicalUrl = createAbsoluteUrl(docsOrigin, docsBase, canonicalPath);

  expectIncludes(html, `<html lang="${expectedHtmlLang}"`, `Missing HTML language on ${filePath}`);
  expectTag(
    html,
    "meta",
    { content: expectedDescription, name: "description" },
    `Missing description metadata on ${filePath}`,
  );
  expectTag(
    html,
    "meta",
    { content: "index, follow", name: "robots" },
    `Missing robots metadata on ${filePath}`,
  );
  expectTag(
    html,
    "meta",
    { content: "summary_large_image", name: "twitter:card" },
    `Missing Twitter card metadata on ${filePath}`,
  );
  expectTag(
    html,
    "meta",
    { content: twitterSite, name: "twitter:site" },
    `Missing Twitter site metadata on ${filePath}`,
  );
  expectTag(
    html,
    "link",
    { href: canonicalUrl, rel: "canonical" },
    `Missing canonical URL on ${filePath}`,
  );
  expectTag(
    html,
    "link",
    {
      href: logoPublicPath,
      rel: "icon",
      sizes: "1000x1000",
      type: "image/png",
    },
    `Missing favicon on ${filePath}`,
  );

  for (const propertyName of [
    "og:site_name",
    "og:title",
    "og:description",
    "og:type",
    "og:url",
    "og:image",
    "og:locale",
  ]) {
    expectTag(
      html,
      "meta",
      { property: propertyName },
      `Missing ${propertyName} metadata on ${filePath}`,
    );
  }

  for (const name of ["twitter:title", "twitter:description", "twitter:image"]) {
    expectTag(html, "meta", { name }, `Missing ${name} metadata on ${filePath}`);
  }

  expectTag(
    html,
    "meta",
    { content: expectedLocale, property: "og:locale" },
    `Missing locale metadata on ${filePath}`,
  );
  expectTag(
    html,
    "meta",
    { content: openGraphImageUrl, property: "og:image" },
    `Missing Open Graph image URL on ${filePath}`,
  );
  expectTag(
    html,
    "meta",
    { content: twitterImageUrl, name: "twitter:image" },
    `Missing Twitter image URL on ${filePath}`,
  );

  if (alternateHrefLang !== undefined && alternatePath !== undefined) {
    const alternateUrl = createAbsoluteUrl(docsOrigin, docsBase, alternatePath);
    expectTag(
      html,
      "link",
      { href: alternateUrl, hreflang: alternateHrefLang, rel: "alternate" },
      `Missing alternate locale link on ${filePath}`,
    );
  }
}

function validateSitemap() {
  const sitemapPath = join(outputRoot, "sitemap.xml");

  if (!existsSync(sitemapPath)) {
    failures.push(`Sitemap is missing: ${sitemapPath}`);
    return;
  }

  const sitemap = readFileSync(sitemapPath, "utf8");

  for (const path of ["/", "/en-US/", "/zh-CN/"]) {
    const expectedUrl = createAbsoluteUrl(docsOrigin, docsBase, path);

    if (!sitemap.includes(`<loc>${expectedUrl}</loc>`)) {
      failures.push(`Sitemap is missing URL: ${expectedUrl}`);
    }
  }
}

function validateNoOpenApiJson() {
  if (!existsSync(outputRoot)) {
    return;
  }

  for (const filePath of listFiles(outputRoot)) {
    if (filePath.toLowerCase().endsWith(`${sep}openapi.json`)) {
      failures.push(`Static docs must not publish openapi.json: ${filePath}`);
    }
  }
}

function validateFileExists(filePath, message) {
  if (!existsSync(filePath)) {
    failures.push(`${message}: ${filePath}`);
  }
}

function expectIncludes(content, expected, message) {
  if (!content.includes(expected)) {
    failures.push(message);
  }
}

function expectTag(content, tagName, expectedAttributes, message) {
  if (!hasTagWithAttributes(content, tagName, expectedAttributes)) {
    failures.push(message);
  }
}

function hasTagWithAttributes(content, tagName, expectedAttributes) {
  const tagPattern = new RegExp(`<${tagName}\\s+[^>]*>`, "giu");
  const tags = content.match(tagPattern) ?? [];

  return tags.some((tag) =>
    Object.entries(expectedAttributes).every(([name, value]) => hasAttribute(tag, name, value)),
  );
}

function hasAttribute(tag, name, value) {
  const pattern = new RegExp(`${escapeRegExp(name)}="${escapeRegExp(value)}"`, "iu");

  return pattern.test(tag);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readPngDimensions(filePath) {
  const bytes = readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";

  if (bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    failures.push(`Social preview image must be a PNG: ${filePath}`);
    return { height: 0, width: 0 };
  }

  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
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

function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/u, "");
}

function normalizeBase(value) {
  const rawValue = value?.trim() || "/";

  if (rawValue === "/") {
    return "/";
  }

  return `/${rawValue.replace(/^\/+|\/+$/gu, "")}/`;
}

function createAbsoluteUrl(origin, base, path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const basePath = base === "/" ? "" : base.replace(/\/$/u, "");
  const fullPath = `${basePath}${normalizedPath}`;

  return new URL(fullPath, `${origin}/`).toString();
}

function createPublicPath(base, path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base === "/") {
    return normalizedPath;
  }

  return `${base.replace(/\/$/u, "")}${normalizedPath}`;
}
