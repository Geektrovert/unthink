/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string | undefined;
  readonly VITE_POSTHOG_HOST: string | undefined;
  readonly VITE_POSTHOG_KEY: string | undefined;
  readonly VITE_RELEASE: string | undefined;
  readonly VITE_VERCEL_GIT_COMMIT_SHA: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
