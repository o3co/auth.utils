import type { Server } from "node:http";

export function gracefulShutdown(server: Server, cleanup?: () => void): void {
  const handler = (): void => {
    cleanup?.();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
}
