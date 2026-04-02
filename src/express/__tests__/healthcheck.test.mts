import express from "express";
import { describe, expect, it } from "vitest";
import { createHealthcheckRouter } from "../healthcheck.mjs";

function createApp(path?: string): express.Express {
	const app = express();
	app.use(createHealthcheckRouter(path));
	return app;
}

async function request(app: express.Express, path: string) {
	const server = app.listen(0);
	const port = (server.address() as { port: number }).port;
	try {
		const res = await fetch(`http://localhost:${port}${path}`);
		const text = await res.text();
		let body: unknown = null;
		try {
			body = JSON.parse(text);
		} catch {
			body = null;
		}
		return { status: res.status, body };
	} finally {
		server.close();
	}
}

describe("createHealthcheckRouter", () => {
	it("responds with 200 and { status: 'ok' } on default path", async () => {
		const app = createApp();
		const { status, body } = await request(app, "/healthcheck");
		expect(status).toBe(200);
		expect(body).toEqual({ status: "ok" });
	});

	it("supports custom path", async () => {
		const app = createApp("/_healthcheck");
		const { status, body } = await request(app, "/_healthcheck");
		expect(status).toBe(200);
		expect(body).toEqual({ status: "ok" });
	});

	it("returns 404 for non-healthcheck paths", async () => {
		const app = createApp();
		const { status } = await request(app, "/other");
		expect(status).toBe(404);
	});
});
