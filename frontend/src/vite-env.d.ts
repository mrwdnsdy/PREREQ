/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the PREREQ backend API. Defaults to http://localhost:3000. */
  readonly VITE_API_URL?: string
  /** '1' enables the in-browser demo backend (used for the public Pages build). */
  readonly VITE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
