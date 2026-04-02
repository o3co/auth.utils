export interface Logger {
	info(...args: [string] | [Record<string, unknown>, string]): void;
	warn(...args: [string] | [Record<string, unknown>, string]): void;
	error(...args: [string] | [Record<string, unknown>, string]): void;
	debug(...args: [string] | [Record<string, unknown>, string]): void;
}

export interface LoggerOptions {
	level?: string;
	logger?: Logger;
}

type LogMethod = (...args: [string] | [Record<string, unknown>, string]) => void;

let pinoModule: { default: (opts: { name: string; level: string }) => Logger } | null = null;
try {
	pinoModule = await import("pino");
} catch {
	// pino not installed — will use console fallback
}

function createConsoleMethod(prefix: string, method: (...args: unknown[]) => void): LogMethod {
	return (...args: [string] | [Record<string, unknown>, string]) => {
		if (typeof args[0] === "string") {
			method(prefix, args[0]);
		} else {
			method(prefix, args[1], args[0]);
		}
	};
}

function createConsoleLogger(name: string): Logger {
	const prefix = `[${name}]`;
	return {
		info: createConsoleMethod(prefix, console.info.bind(console)),
		warn: createConsoleMethod(prefix, console.warn.bind(console)),
		error: createConsoleMethod(prefix, console.error.bind(console)),
		debug: createConsoleMethod(prefix, console.debug.bind(console)),
	};
}

export function createLogger(name: string, options?: LoggerOptions): Logger {
	if (options?.logger) return options.logger;
	if (pinoModule) {
		return pinoModule.default({
			name,
			level: options?.level ?? process.env.LOG_LEVEL ?? "info",
		}) as unknown as Logger;
	}
	return createConsoleLogger(name);
}
