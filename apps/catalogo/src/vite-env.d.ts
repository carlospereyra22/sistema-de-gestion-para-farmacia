/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API: en producción "/api/v1" (proxy de Netlify, mismo origen). */
  readonly VITE_API_URL?: string;
}
