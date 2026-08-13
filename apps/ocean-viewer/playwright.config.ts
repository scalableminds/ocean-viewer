import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	// One retry in CI: this gates releases, and a single WebGL hiccup shouldn't
	// block one. A second failure is a real signal.
	retries: process.env.CI ? 1 : 0,
	timeout: 120_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
	use: {
		// Full Chromium with --headless=new, NOT chromium-headless-shell:
		// Neuroglancer needs WebGL2 + EXT_color_buffer_float and fails opaquely
		// without them.
		channel: "chromium",
		launchOptions: {
			args: [
				"--use-gl=angle",
				"--use-angle=swiftshader",
				// Required since Chrome ~128, which otherwise gates SwiftShader WebGL.
				"--enable-unsafe-swiftshader",
			],
		},
		trace: process.env.CI ? "retain-on-failure" : "off",
		video: "off",
	},
});
