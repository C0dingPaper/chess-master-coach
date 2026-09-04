// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

function connectedDeviceLogger(): Plugin {
  const connectedAddresses = new Set<string>();

  return {
    name: "connected-device-logger",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const address = request.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "unknown";
        const isLocal = address === "127.0.0.1" || address === "::1";

        if (!isLocal && !connectedAddresses.has(address)) {
          connectedAddresses.add(address);
          const userAgent = request.headers["user-agent"] ?? "Unknown device";
          console.info(`[device] Connected: ${address} (${userAgent})`);
        }

        next();
      });
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [connectedDeviceLogger()],
  },
});
