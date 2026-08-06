import type { Plugin } from "vite";

// Webpack magic comments in a dependency break Vite's Web Worker detection.
//
// Vite finds worker entry points with a *regex*, not an AST walk (see
// `workerImportMetaUrlPlugin` in vite/dist/node/chunks/node.js):
//
//   /\bnew\s+(?:Worker|SharedWorker)\s*\(\s*(new\s+URL\s*\(\s*(…)\s*,\s*import\.meta\.url…/
//
// The `\s*` between `new Worker(` and `new URL(` cannot span a comment — and
// neuroglancer, which also ships a webpack build, puts one in exactly that gap:
//
//   this.worker = new Worker(
//     /* webpackChunkName: "neuroglancer_chunk_worker" */
//     new URL("./chunk_worker.bundle.js", import.meta.url),
//     { type: "module" },
//   );
//
// so `vite:worker-import-meta-url` never fires. In dev that is harmless — the
// browser loads the worker straight from the dev server, which resolves the
// worker's `#src/*` subpath imports on demand. In a production build the
// `new URL(…, import.meta.url)` instead falls through to Vite's *static asset*
// handling: the worker entry is emitted as a raw asset and, being well under
// `build.assetsInlineLimit` (669 B vs. 4096 B), inlined verbatim as a
// `data:text/javascript;base64,…` URL — unbundled, `#src/*` imports and all.
// The worker then fails to start, silently: the UI mounts, the position readout
// works, no console or network errors appear, and no volumetric data ever
// decodes, because every chunk request goes through that worker.
//
// Blanking the comments out lets Vite's regex match and bundle the worker graph
// properly. A good build emits separate `chunk_worker.bundle-*.js` and
// `async_computation.bundle-*.js` chunks plus the blosc/zstd codecs and the
// decoder `.wasm` files; a broken one emits a single `index-*.js` with none of
// those and one `data:text/javascript;base64,…` inside it.
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
			// Only neuroglancer is known to need this; the guard keeps the regex
			// off every other module in the graph.
			if (!id.includes("neuroglancer") || !code.includes("new Worker(")) {
				return null;
			}
			const patched = code.replace(
				WORKER_MAGIC_COMMENT_RE,
				// Keep newlines so line numbers survive; blank everything else so
				// columns do too. The result is offset-identical to the input, so
				// returning `map: null` leaves the existing source map valid.
				(_, before, comment: string, after) =>
					`${before}${comment.replace(/[^\n]/g, " ")}${after}`,
			);
			return patched === code ? null : { code: patched, map: null };
		},
	};
}
