import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

function createAuthProxy(value: string | undefined): Record<string, ProxyOptions> | undefined {
  if (value === undefined || value.length === 0) return undefined;

  const target = new URL(value);
  if (
    target.origin !== value ||
    target.protocol !== "https:" ||
    !target.hostname.endsWith(".convex.site")
  ) {
    throw new Error("VITE_CONVEX_SITE_URL must be an exact HTTPS Convex site origin");
  }

  return {
    "/api/auth": {
      changeOrigin: true,
      target: target.origin,
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const authProxy = createAuthProxy(environment.VITE_CONVEX_SITE_URL);
  const vercelBuild = environment.VERCEL === "1";

  return {
    build: { sourcemap: vercelBuild ? "hidden" : false },
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    preview: authProxy === undefined ? undefined : { proxy: authProxy },
    server: authProxy === undefined ? undefined : { proxy: authProxy },
  };
});
