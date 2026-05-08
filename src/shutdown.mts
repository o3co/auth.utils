import type { Server } from "node:http";

export function gracefulShutdown(server: Server, cleanup?: () => void | Promise<void>): void {
	const handler = (): void => {
		server.close(async () => {
			try {
				await cleanup?.();
			} catch (err) {
				console.error("gracefulShutdown: cleanup error", err);
			}
			process.exit(0);
		});
		server.closeIdleConnections();
	};
	process.on("SIGTERM", handler);
	process.on("SIGINT", handler);
}
