import { createRequire } from "node:module";
import { defineConfig } from "vite";

// Neuroglancer spawns ES-module Web Workers via
//   `new Worker(new URL("./chunk_worker.bundle.js", import.meta.url), { type: "module" })`
// and those worker bundles use the package's `#src/*` subpath imports. Vite/Rollup
// resolve this natively, but esbuild's dependency pre-bundling (optimizeDeps) mangles
// the `import.meta.url` worker references, so we exclude neuroglancer from pre-bundling
// and let Rollup handle it in both dev and build.
//
// The three entries below are resolved via `require.resolve`, not a hardcoded
// "node_modules/..." path: in this npm workspace, neuroglancer hoists to the
// repo-root node_modules rather than this package's own, and a literal
// relative path would silently stop matching. They go through the
// `neuroglancer/unstable/*` subpath (neuroglancer's package.json `exports`
// maps that to `./lib/*`) rather than `neuroglancer/lib/*` directly, since
// `./lib/*` isn't itself a published export and `require.resolve` — unlike a
// plain relative path — enforces the package's `exports` map.
const require = createRequire(import.meta.url);

export default defineConfig({
	worker: {
		format: "es",
	},
	server: {
		hmr: false,
	},
	build: {
		target: "es2022",
		sourcemap: true,
	},
	optimizeDeps: {
		entries: [
			require.resolve("neuroglancer/unstable/main.bundle.js"),
			require.resolve("neuroglancer/unstable/async_computation.bundle.js"),
			require.resolve("neuroglancer/unstable/chunk_worker.bundle.js"),
		],
	},
});
