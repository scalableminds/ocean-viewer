/**
 * Minimal static file server for the smoke test.
 *
 * Off-the-shelf servers don't give us an arbitrary URL-prefix mount (needed so
 * that an absolute `/assets/…` URL shows up as a 404 instead of silently working)
 * or `Content-Type: application/wasm`, which `instantiateStreaming` requires.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".wasm": "application/wasm",
};

export interface StaticServer {
	/** Listen on an ephemeral port; resolves to the origin. */
	listen(): Promise<string>;
	close(): Promise<void>;
}

/** @param mounts URL prefix → directory. Longest matching prefix wins. */
export function createStaticServer(
	mounts: Record<string, string>,
): StaticServer {
	const entries = Object.entries(mounts).sort(
		([a], [b]) => b.length - a.length,
	);

	async function serve(rawUrl: string, res: ServerResponse): Promise<void> {
		const url = new URL(rawUrl, "http://localhost");
		const mount = entries.find(
			([prefix]) =>
				prefix === "/" ||
				url.pathname === prefix ||
				url.pathname.startsWith(`${prefix}/`),
		);
		if (mount === undefined) {
			res.writeHead(404).end(`no mount for ${url.pathname}`);
			return;
		}

		const [prefix, root] = mount;
		const rootDir = resolve(root);
		let rel = decodeURIComponent(
			prefix === "/" ? url.pathname : url.pathname.slice(prefix.length),
		);
		if (rel === "" || rel.endsWith("/")) {
			rel += "index.html";
		}

		const file = resolve(join(rootDir, normalize(rel)));
		// Traversal guard: stay inside the mount root.
		if (file !== rootDir && !file.startsWith(rootDir + sep)) {
			res.writeHead(403).end("forbidden");
			return;
		}

		try {
			const info = await stat(file);
			if (!info.isFile()) {
				res.writeHead(404).end(`not a file: ${url.pathname}`);
				return;
			}
			res.writeHead(200, {
				"content-type": MIME[extname(file)] ?? "application/octet-stream",
				"content-length": String(info.size),
				"cache-control": "no-store",
			});
			createReadStream(file).pipe(res);
		} catch {
			res.writeHead(404).end(`not found: ${url.pathname}`);
		}
	}

	const server: Server = createServer((req, res) => {
		void serve(req.url ?? "/", res);
	});

	return {
		// Port 0 so parallel runs and leftover processes can't collide.
		listen() {
			return new Promise<string>((done, fail) => {
				server.once("error", fail);
				server.listen(0, "127.0.0.1", () => {
					const address = server.address();
					if (address === null || typeof address === "string") {
						fail(new Error("server did not bind a port"));
						return;
					}
					done(`http://127.0.0.1:${address.port}`);
				});
			});
		},
		close() {
			return new Promise<void>((done) => {
				server.close(() => done());
			});
		},
	};
}
