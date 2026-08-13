/**
 * Release gate: the packaged tarball installs, and the bundle inside it loads and
 * responds to a CONFIG when served from an arbitrary sub-path in a cross-origin
 * iframe.
 *
 * It runs against `npm pack` output rather than `dist/` directly, so a wrong
 * `files` field fails here rather than after a release. No network access.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Frame, type Page, test } from "@playwright/test";
import { createStaticServer, type StaticServer } from "./static-server.js";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const HARNESS = fileURLToPath(new URL("./harness", import.meta.url));

/** Deep and ugly on purpose: any absolute /assets/ URL 404s here. */
const MOUNT = "/x/y/z";

/** `npm pack` the app, extract it, and return the extracted `dist/`. */
function packAndExtract(): string {
	const dir = mkdtempSync(join(tmpdir(), "ocean-viewer-pack-"));
	execFileSync("npm", ["pack", "--pack-destination", dir], {
		cwd: APP_DIR,
		stdio: "pipe",
	});
	const tarball = readdirSync(dir).find((f) => f.endsWith(".tgz"));
	if (tarball === undefined) {
		throw new Error(`npm pack produced no tarball in ${dir}`);
	}
	execFileSync("tar", ["-xzf", join(dir, tarball), "-C", dir], {
		stdio: "pipe",
	});
	return join(dir, "package", "dist");
}

function viewerFrame(page: Page, origin: string): Frame {
	const frame = page.frames().find((f) => f.url().startsWith(origin));
	if (frame === undefined) {
		throw new Error(
			`viewer frame not found; frames: ${page
				.frames()
				.map((f) => f.url())
				.join(", ")}`,
		);
	}
	return frame;
}

/**
 * `showAxisLines` as the viewer has it. Undefined is the default — Neuroglancer's
 * `toJSON()` omits fields still at their default, and axis lines default to on.
 */
function readShowAxisLines(frame: Frame): Promise<boolean | undefined> {
	return frame.evaluate(
		() =>
			(
				window as unknown as {
					viewer?: { state: { toJSON(): { showAxisLines?: boolean } } };
				}
			).viewer?.state.toJSON().showAxisLines,
	);
}

test.describe("packaged bundle", () => {
	let servers: StaticServer[];
	let hostOrigin: string;
	let viewerOrigin: string;

	test.beforeAll(async () => {
		const dist = packAndExtract();
		const host = createStaticServer({ "/": HARNESS });
		const viewer = createStaticServer({ [MOUNT]: dist });
		servers = [host, viewer];
		hostOrigin = await host.listen();
		viewerOrigin = await viewer.listen();
	});

	test.afterAll(async () => {
		await Promise.all(servers.map((s) => s.close()));
	});

	test("WebGL2 and EXT_color_buffer_float are available", async ({ page }) => {
		// A pre-flight, not a feature test: Neuroglancer throws without both, and
		// bootstrap() swallows it — so on a browser lacking them the test below
		// fails as "no READY", which says nothing about the cause.
		await page.goto(`${viewerOrigin}${MOUNT}/version.json`);
		const support = await page.evaluate(() => {
			const gl = document.createElement("canvas").getContext("webgl2");
			return {
				webgl2: gl !== null,
				colorBufferFloat:
					gl !== null && gl.getExtension("EXT_color_buffer_float") !== null,
			};
		});
		expect(
			support,
			"this browser cannot run Neuroglancer; check the SwiftShader flags in playwright.config.ts",
		).toEqual({ webgl2: true, colorBufferFloat: true });
	});

	test("loads from a sub-path and applies a CONFIG", async ({ page }) => {
		const failures: string[] = [];
		const consoleErrors: string[] = [];
		// Both origins, not just the viewer's: the console error for a 404 carries no
		// URL, so a host-page miss would otherwise fail the assertion below without
		// saying what was missing.
		page.on("response", (r) => {
			if (r.status() >= 400) {
				failures.push(`${r.status()} ${r.url()}`);
			}
		});
		page.on("requestfailed", (r) => {
			failures.push(
				`failed ${r.url()}: ${r.failure()?.errorText ?? "unknown"}`,
			);
		});
		page.on("console", (m) => {
			if (m.type() === "error") consoleErrors.push(m.text());
		});

		const url = new URL(hostOrigin);
		url.searchParams.set("src", `${viewerOrigin}${MOUNT}/index.html`);
		await page.goto(url.toString());

		// READY is the last line of bootstrap(), which swallows every throw — so its
		// arrival means the module graph, the workers and WebGL all came up.
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							(window as unknown as { __smoke: { ready: unknown } }).__smoke
								.ready,
					),
				{ timeout: 30_000, message: "viewer never sent READY" },
			)
			.not.toBeNull();

		// Any absolute "/assets/..." URL in the bundle would 404 at this mount.
		expect(failures, "requests failed under the sub-path mount").toEqual([]);
		expect(consoleErrors, "console errors during boot").toEqual([]);

		// The harness posts a CONFIG on READY; confirm it reached the viewer state.
		const frame = viewerFrame(page, viewerOrigin);
		await expect
			.poll(() => readShowAxisLines(frame), {
				timeout: 10_000,
				message: "CONFIG was never applied",
			})
			.toBe(false);

		// The chunk worker is created in DataManagementContext's constructor, so it
		// must be running by now.
		const workers = page.workers().map((w) => w.url());
		expect(
			workers.some((w) => w.includes("chunk_worker.bundle")),
			`chunk worker not running (workers: ${workers.join(", ") || "none"})`,
		).toBe(true);

		// version.json is fetchable at a predictable URL.
		const meta = await page.request.get(`${viewerOrigin}${MOUNT}/version.json`);
		expect(meta.ok()).toBe(true);
		expect(await meta.json()).toMatchObject({
			name: "@scalableminds/ocean-viewer",
		});
	});
});
