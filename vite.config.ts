import { defineConfig } from "vite";

// Neuroglancer spawns ES-module Web Workers via
//   `new Worker(new URL("./chunk_worker.bundle.js", import.meta.url), { type: "module" })`
// and those worker bundles use the package's `#src/*` subpath imports. Vite/Rollup
// resolve this natively, but esbuild's dependency pre-bundling (optimizeDeps) mangles
// the `import.meta.url` worker references, so we exclude neuroglancer from pre-bundling
// and let Rollup handle it in both dev and build.
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
			"node_modules/neuroglancer/lib/main.bundle.js",
			"node_modules/neuroglancer/lib/async_computation.bundle.js",
			"node_modules/neuroglancer/lib/chunk_worker.bundle.js",
		],
	},
});
