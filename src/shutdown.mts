import type { Server } from "node:http";

export function gracefulShutdown(server: Server, cleanup?: () => void | Promise<void>): void {
	let shuttingDown = false;
	const handler = (): void => {
		if (shuttingDown) return;
		shuttingDown = true;
		process.removeListener("SIGTERM", handler);
		process.removeListener("SIGINT", handler);
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
