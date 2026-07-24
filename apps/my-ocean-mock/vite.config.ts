import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone dev harness. It runs on its own port and embeds the Ocean Viewer
// dev server (default http://localhost:5174) in an <iframe>, driving it over
// postMessage exactly as the real MyOcean Data Portal would.
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5180,
	},
});
