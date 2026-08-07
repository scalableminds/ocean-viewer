import type { Plugin } from "vite";

// Vite finds worker entry points with a regex requiring `new Worker(` to be
// immediately followed by `new URL(...)`. Neuroglancer's webpack build puts a
// `/* webpackChunkName: ... */` comment in that gap, so the regex never
// matches and the worker entry falls through to static-asset handling instead
// of being bundled — it gets inlined as a data: URL, unbundled subpath
// imports and all, and fails to start silently (no decoded volumetric data,
// no console errors). Blanking the comment out restores the match.
const WORKER_MAGIC_COMMENT_RE =
	/(\bnew\s+(?:Worker|SharedWorker)\s*\(\s*)((?:\/\*[\s\S]*?\*\/\s*)+)(new\s+URL\s*\()/g;

/**
 * Removes webpack magic comments that sit between `new Worker(` and its
 * `new URL(…, import.meta.url)` argument, so Vite recognises the worker entry.
 *
 * Register it under both `plugins` and `worker.plugins`: worker sub-builds do
 * not inherit user plugins, and neuroglancer's chunk worker spawns a nested
 * `async_computation.bundle.js` worker carrying the same comment.
 */
export function stripWebpackMagicComments(): Plugin {
	return {
		name: "ocean-viewer:strip-webpack-magic-comments",
		// Must beat vite:worker-import-meta-url to the file.
		enforce: "pre",
		transform(code, id) {
			// Only neuroglancer is known to need this.
			if (!id.includes("neuroglancer") || !code.includes("new Worker(")) {
				return null;
			}
			const patched = code.replace(
				WORKER_MAGIC_COMMENT_RE,
				// Keep newlines/length so the result stays offset-identical to the
				// input, keeping the existing source map (and `map: null`) valid.
				(_, before, comment: string, after) =>
					`${before}${comment.replace(/[^\n]/g, " ")}${after}`,
			);
			return patched === code ? null : { code: patched, map: null };
		},
	};
}
