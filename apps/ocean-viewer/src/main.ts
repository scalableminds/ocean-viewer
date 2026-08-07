// Side-effect import: registers all frontend layer types, data sources
// (zarr, precomputed, n5, ...) and key-value stores with Neuroglancer.
import "neuroglancer/unstable/main_module.js";

import { resolveShader } from "@ocean-viewer/colormaps/shader";
import { Bridge } from "./wrapper/bridge.js";
import { ConfigApplier } from "./wrapper/config.js";
import { registerOceanImageLayer } from "./wrapper/image-layer.js";
import { PointerForwarder } from "./wrapper/pointer.js";
import { Reporter } from "./wrapper/report.js";
import { installUnitLabels } from "./wrapper/units.js";
import { createViewer, parseHashState } from "./wrapper/viewer.js";
import { ViewportControls } from "./wrapper/viewport-controls.js";

// Loaded last so these rules override Neuroglancer's own stylesheet.
import "./chrome.css";

/**
 * Bootstrap the Ocean Viewer.
 *
 * Creates Neuroglancer (4-panel layout) with a one-off `#!{JSON}` hash seed,
 * then attaches the MyOcean postMessage bridge:
 *   - inbound CONFIG  → applied to the viewer state (full or partial)
 *   - outbound READY  → sent once when the bridge is listening
 *   - outbound REPORT → debounced serialised state after user interaction
 *   - outbound CLICK  → position + per-layer values for a click in a data panel
 *   - outbound HOVER  → the same, throttled, as the pointer moves over the data
 *
 * Also overlays the 3D panel with camera reset / axis-align buttons, since
 * Neuroglancer's own recovery affordances are hidden chrome or key bindings.
 */
function bootstrap(): void {
	const target = document.getElementById("neuroglancer-container");
	if (target === null) {
		throw new Error("#neuroglancer-container element not found");
	}

	// Swap in the Ocean image layer before any layer is created, so every image
	// layer reports values in physical units.
	registerOceanImageLayer();

	const viewer = createViewer(target);
	installUnitLabels(viewer);
	new ViewportControls(viewer);
	// Expose for debugging / automation.
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

	new PointerForwarder(viewer, bridge);

	// Everything is wired up and the bridge is listening: tell the parent it can
	// send CONFIG now, so it doesn't have to guess with a timeout.
	bridge.sendReady();
}

try {
	bootstrap();
} catch (err) {
	// eslint-disable-next-line no-console
	console.error("[ocean-viewer] bootstrap failed", err);
}
