// Side-effect import: registers all frontend layer types, data sources
// (zarr, precomputed, n5, ...) and key-value stores with Neuroglancer.
import "neuroglancer/unstable/main_module.js";

import { resolveShader } from "@ocean-viewer/colormaps/shader";
import { Bridge } from "./wrapper/bridge.js";
import { ConfigApplier } from "./wrapper/config.js";
import { Reporter } from "./wrapper/report.js";
import { installUnitLabels } from "./wrapper/units.js";
import { createViewer, parseHashState } from "./wrapper/viewer.js";

// Loaded last so these rules override Neuroglancer's own stylesheet.
import "./chrome.css";

/**
 * Bootstrap the Ocean Viewer.
 *
 * Creates Neuroglancer (4-panel layout) with a one-off `#!{JSON}` hash seed,
 * then attaches the MyOcean postMessage bridge:
 *   - inbound CONFIG  → applied to the viewer state (full or partial)
 *   - outbound REPORT → debounced serialised state after user interaction
 */
function bootstrap(): void {
	const target = document.getElementById("neuroglancer-container");
	if (target === null) {
		throw new Error("#neuroglancer-container element not found");
	}

	const viewer = createViewer(target);
	installUnitLabels(viewer);
	// Expose for debugging / automation (parity with Neuroglancer's default setup).
	(window as unknown as { viewer: unknown; oceanViewer: unknown }).viewer =
		viewer;
	(window as unknown as { oceanViewer: unknown }).oceanViewer = {
		resolveShader,
	};

	// ConfigApplier captures the pristine default state in its constructor, so
	// create it before any state is applied.
	const configApplier = new ConfigApplier(viewer);

	// One-off seed from the `#!{JSON}` URL hash, applied as an initial full state.
	const hashState = parseHashState(location.hash);
	if (hashState !== undefined) {
		configApplier.apply({ type: "CONFIG", state: hashState, mode: "full" });
	}

	// `reporter` is referenced by the bridge's onConfig callback, which only runs
	// once a message arrives — by then it is assigned below.
	let reporter: Reporter | undefined;

	const bridge = new Bridge({
		// Lock to a build-time origin when provided; otherwise the bridge locks
		// onto the first valid sender (handshake).
		parentOrigin: import.meta.env.VITE_PARENT_ORIGIN || undefined,
		onConfig: (message) => {
			configApplier.apply(message);
			// The applied state is not a user interaction; don't echo it back.
			reporter?.captureBaseline();
		},
	});

	reporter = new Reporter(viewer, bridge);
	// Don't report the initial (seed) state as if it were a user interaction.
	reporter.captureBaseline();
}

try {
	bootstrap();
} catch (err) {
	// eslint-disable-next-line no-console
	console.error("[ocean-viewer] bootstrap failed", err);
}
