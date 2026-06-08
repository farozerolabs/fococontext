import "./index.css"

async function loadRuntimeConfig() {
  try {
    const runtimeConfigUrl = "/runtime-config.js"
    await import(/* @vite-ignore */ runtimeConfigUrl)
  } catch {
    // Runtime config is optional in test and static preview contexts.
  }
}

async function bootstrap() {
  await loadRuntimeConfig()

  const [{ StrictMode }, { createRoot }, { default: App }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("./App.js"),
  ])
  const rootElement = document.getElementById("root")

  if (rootElement === null) {
    throw new Error("Admin Console root element is missing.")
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
