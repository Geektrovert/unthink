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
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "telemetry-vendor",
                priority: 30,
                test: /node_modules[\\/]posthog-js[\\/]/,
              },
              {
                name: "convex-vendor",
                priority: 20,
                test: /node_modules[\\/](?:@convex-dev|better-auth|convex)[\\/]/,
              },
              {
                name: "react-vendor",
                priority: 10,
                test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              },
              {
                name: "vendor",
                maxSize: 250_000,
                test: /node_modules[\\/]/,
              },
            ],
          },
        },
      },
      sourcemap: vercelBuild ? "hidden" : false,
    },
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    preview: authProxy === undefined ? undefined : { proxy: authProxy },
    server: authProxy === undefined ? undefined : { proxy: authProxy },
  };
});
