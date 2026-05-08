import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gracefulShutdown } from "../shutdown.mjs";

const flushMicrotasks = async (): Promise<void> => {
	await new Promise<void>((r) => setImmediate(r));
	await new Promise<void>((r) => setImmediate(r));
};

describe("gracefulShutdown", () => {
	const listeners: Map<string, (...args: unknown[]) => void> = new Map();

	afterEach(() => {
		for (const [event, handler] of listeners) {
			process.removeListener(event, handler);
		}
		listeners.clear();
	});

	it("registers SIGTERM and SIGINT handlers", () => {
		const onSpy = vi.spyOn(process, "on");
		const server = createServer();

		gracefulShutdown(server);

		const sigterm = onSpy.mock.calls.find(([event]) => event === "SIGTERM");
		const sigint = onSpy.mock.calls.find(([event]) => event === "SIGINT");
		expect(sigterm).toBeDefined();
		expect(sigint).toBeDefined();

		if (sigterm) listeners.set("SIGTERM", sigterm[1] as () => void);
		if (sigint) listeners.set("SIGINT", sigint[1] as () => void);

		onSpy.mockRestore();
	});

	it("invokes cleanup inside server.close callback (after in-flight requests drain)", async () => {
		const order: string[] = [];
		const cleanup = vi.fn(() => {
			order.push("cleanup");
		});
		const server = createServer();
		const closeSpy = vi.spyOn(server, "close").mockImplementation((cb) => {
			order.push("close");
			cb?.();
			return server;
		});
		const closeAllSpy = vi.spyOn(server, "closeIdleConnections").mockImplementation(() => server);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			order.push("exit");
			return undefined as never;
		});
		const onSpy = vi.spyOn(process, "on");

		gracefulShutdown(server, cleanup);

		const handler = onSpy.mock.calls.find(([event]) => event === "SIGTERM")?.[1] as () => void;
		listeners.set("SIGTERM", handler);
		handler();
		await flushMicrotasks();

		expect(order).toEqual(["close", "cleanup", "exit"]);

		closeSpy.mockRestore();
		closeAllSpy.mockRestore();
		exitSpy.mockRestore();
		onSpy.mockRestore();
	});

	it("awaits an async cleanup before exiting", async () => {
		let cleanupResolved = false;
		const cleanup = vi.fn(async () => {
			await new Promise<void>((r) => setTimeout(r, 30));
			cleanupResolved = true;
		});
		const server = createServer();
		const closeSpy = vi.spyOn(server, "close").mockImplementation((cb) => {
			cb?.();
			return server;
		});
		const closeAllSpy = vi.spyOn(server, "closeIdleConnections").mockImplementation(() => server);
		let exitObservedCleanupResolved = false;
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			exitObservedCleanupResolved = cleanupResolved;
			return undefined as never;
		});
		const onSpy = vi.spyOn(process, "on");

		gracefulShutdown(server, cleanup);

		const handler = onSpy.mock.calls.find(([event]) => event === "SIGTERM")?.[1] as () => void;
		listeners.set("SIGTERM", handler);
		handler();
		await new Promise<void>((r) => setTimeout(r, 60));

		expect(cleanup).toHaveBeenCalledOnce();
		expect(cleanupResolved).toBe(true);
		expect(exitSpy).toHaveBeenCalledWith(0);
		expect(exitObservedCleanupResolved).toBe(true);

		closeSpy.mockRestore();
		closeAllSpy.mockRestore();
		exitSpy.mockRestore();
		onSpy.mockRestore();
	});

	it("logs cleanup errors via console.error and still exits", async () => {
		const cleanupErr = new Error("cleanup boom");
		const cleanup = vi.fn(async () => {
			throw cleanupErr;
		});
		const server = createServer();
		const closeSpy = vi.spyOn(server, "close").mockImplementation((cb) => {
			cb?.();
			return server;
		});
		const closeAllSpy = vi.spyOn(server, "closeIdleConnections").mockImplementation(() => server);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const onSpy = vi.spyOn(process, "on");

		gracefulShutdown(server, cleanup);

		const handler = onSpy.mock.calls.find(([event]) => event === "SIGTERM")?.[1] as () => void;
		listeners.set("SIGTERM", handler);
		handler();
		await flushMicrotasks();

		expect(errorSpy).toHaveBeenCalledWith("gracefulShutdown: cleanup error", cleanupErr);
		expect(exitSpy).toHaveBeenCalledWith(0);

		closeSpy.mockRestore();
		closeAllSpy.mockRestore();
		exitSpy.mockRestore();
		errorSpy.mockRestore();
		onSpy.mockRestore();
	});

	it("calls server.closeIdleConnections to drain idle keep-alive sockets without aborting in-flight requests", async () => {
		const server = createServer();
		const closeSpy = vi.spyOn(server, "close").mockImplementation((cb) => {
			cb?.();
			return server;
		});
		const closeAllSpy = vi.spyOn(server, "closeIdleConnections").mockImplementation(() => server);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		const onSpy = vi.spyOn(process, "on");

		gracefulShutdown(server);

		const handler = onSpy.mock.calls.find(([event]) => event === "SIGTERM")?.[1] as () => void;
		listeners.set("SIGTERM", handler);
		handler();
		await flushMicrotasks();

		expect(closeAllSpy).toHaveBeenCalledOnce();

		closeSpy.mockRestore();
		closeAllSpy.mockRestore();
		exitSpy.mockRestore();
		onSpy.mockRestore();
	});

	it("works with a synchronous cleanup function", async () => {
		const cleanup = vi.fn();
		const server = createServer();
		const closeSpy = vi.spyOn(server, "close").mockImplementation((cb) => {
			cb?.();
			return server;
		});
		const closeAllSpy = vi.spyOn(server, "closeIdleConnections").mockImplementation(() => server);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		const onSpy = vi.spyOn(process, "on");

		gracefulShutdown(server, cleanup);

		const sigtermCall = onSpy.mock.calls.find(([event]) => event === "SIGTERM");
		const handler = sigtermCall?.[1] as () => void;
		listeners.set("SIGTERM", handler);

		handler();
		await flushMicrotasks();

		expect(cleanup).toHaveBeenCalledOnce();
		expect(closeSpy).toHaveBeenCalledOnce();
		expect(exitSpy).toHaveBeenCalledWith(0);

		closeSpy.mockRestore();
		closeAllSpy.mockRestore();
		exitSpy.mockRestore();
		onSpy.mockRestore();
	});

	it("works without cleanup function", async () => {
		const server = createServer();
		const closeSpy = vi.spyOn(server, "close").mockImplementation((cb) => {
			cb?.();
			return server;
		});
		const closeAllSpy = vi.spyOn(server, "closeIdleConnections").mockImplementation(() => server);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		const onSpy = vi.spyOn(process, "on");

		gracefulShutdown(server);

		const sigtermCall = onSpy.mock.calls.find(([event]) => event === "SIGTERM");
		const handler = sigtermCall?.[1] as () => void;
		listeners.set("SIGTERM", handler);

		handler();
		await flushMicrotasks();

		expect(closeSpy).toHaveBeenCalledOnce();
		expect(exitSpy).toHaveBeenCalledWith(0);

		closeSpy.mockRestore();
		closeAllSpy.mockRestore();
		exitSpy.mockRestore();
		onSpy.mockRestore();
	});
});
