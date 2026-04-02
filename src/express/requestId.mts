import crypto from "node:crypto";
import type { RequestHandler } from "express";

export interface RequestIdOptions {
	header?: string;
	generator?: () => string;
}

function defaultGenerator(): string {
	const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
	const uid = crypto.randomUUID().replace(/-/g, "");
	return `${ts}_${uid}`;
}

export function createRequestIdMiddleware(options?: RequestIdOptions): RequestHandler {
	const headerKey = (options?.header ?? "x-request-id").toLowerCase();
	const generate = options?.generator ?? defaultGenerator;

	return (req, res, next) => {
		const requestId = (req.headers[headerKey] as string | undefined) ?? generate();
		req.headers[headerKey] = requestId;
		res.setHeader(headerKey, requestId);
		next();
	};
}
