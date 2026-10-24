
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
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [connectedDeviceLogger()],
  },
});
