import { createRequire } from "node:module";
import { defineConfig } from "vite";
import { stripWebpackMagicComments } from "./vite-plugins/strip-webpack-magic-comments";

// Neuroglancer's worker bundles use `import.meta.url`-relative subpath
// imports, which esbuild's dependency pre-bundling mangles — so neuroglancer
// is excluded from pre-bundling and left to Rollup instead.
//
// Resolved via `require.resolve` rather than a hardcoded path: neuroglancer
// hoists to the repo-root node_modules in this workspace, and going through
// the `neuroglancer/unstable/*` export (vs. the unpublished `lib/*` path)
// keeps resolution honoring the package's `exports` map.
const require = createRequire(import.meta.url);

export default defineConfig({
	// Emit relative asset URLs ("assets/…" instead of "/assets/…") so the built
	// app can be served from any sub-path without rebuilding.
	base: "./",
	plugins: [stripWebpackMagicComments()],
	worker: {
		format: "es",
		// Worker sub-builds don't inherit the plugins above.
		plugins: () => [stripWebpackMagicComments()],
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
