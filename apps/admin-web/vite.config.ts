import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin, type ViteDevServer } from "vite"

const require = createRequire(import.meta.url)
const mermaidVendorPath = require.resolve("mermaid/dist/mermaid.min.js")

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    runtimeConfigPlugin(),
    mermaidVendorPlugin(),
  ],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.FOCOCONTEXT_ADMIN_PORT ?? "18081"),
  },
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.FOCOCONTEXT_ADMIN_PORT ?? "18081"),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return readManualChunkName(id)
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
})

function readManualChunkName(id: string): string | undefined {
  if (!id.includes("/node_modules/mermaid/")) {
    return undefined
  }

  if (id.endsWith("/dist/mermaid.esm.min.mjs")) {
    return "mermaid-runtime"
  }

  const marker = "/dist/chunks/mermaid.esm.min/"
  const markerIndex = id.indexOf(marker)

  if (markerIndex === -1) {
    return "mermaid-shared"
  }

  const moduleName = id
    .slice(markerIndex + marker.length)
    .replace(/\.mjs$/u, "")
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")

  return `mermaid-${moduleName}`
}

function mermaidVendorPlugin(): Plugin {
  return {
    name: "fococontext-mermaid-vendor",
    configureServer(server) {
      server.middlewares.use("/vendor/mermaid.min.js", (_request, response) => {
        response.setHeader("cache-control", "no-store")
        response.setHeader("content-type", "text/javascript; charset=utf-8")
        response.end(readFileSync(mermaidVendorPath))
      })
    },
    generateBundle() {
      this.emitFile({
        fileName: "vendor/mermaid.min.js",
        source: readFileSync(mermaidVendorPath),
        type: "asset",
      })
    },
  }
}

function runtimeConfigPlugin() {
  return {
    name: "fococontext-runtime-config",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/runtime-config.js", (_request, response) => {
        response.setHeader("cache-control", "no-store")
        response.setHeader("content-type", "text/javascript; charset=utf-8")
        response.end(
          `window.__FOCOCONTEXT_RUNTIME_CONFIG__ = ${JSON.stringify({
            adminBaseUrl: process.env.FOCOCONTEXT_ADMIN_BASE_URL ?? "",
            apiBaseUrl:
              process.env.FOCOCONTEXT_ADMIN_API_BASE_URL ??
              process.env.VITE_FOCOCONTEXT_API_BASE_URL ??
              "http://localhost:18080/v1",
          })};`
        )
      })
    },
  }
}
