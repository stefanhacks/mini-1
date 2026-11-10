/// <reference types="vite/client" />

interface Window {
  /** Set by main.ts once the renderer is up (see debug-api.ts); undefined while main.ts loads. */
  debug: import("./debug-api.ts").DebugApi;
}
