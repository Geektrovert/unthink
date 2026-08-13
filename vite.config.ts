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
  const authProxy = createAuthProxy(loadEnv(mode, process.cwd(), "").VITE_CONVEX_SITE_URL);

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    preview: authProxy === undefined ? undefined : { proxy: authProxy },
    server: authProxy === undefined ? undefined : { proxy: authProxy },
  };
});
