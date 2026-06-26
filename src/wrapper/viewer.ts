/**
 * Creates the Neuroglancer viewer for the embedded Ocean Viewer and parses the
 * one-off `#!{JSON}` URL hash.
 *
 * This mirrors Neuroglancer's `setupDefaultViewer` but omits the *live* two-way
 * `UrlHashBinding`. In an iframe driven by postMessage that live binding fights
 * inbound CONFIG (it re-asserts the URL hash and reverts programmatic state).
 * Per the spec the hash is a one-off initialisation complement, so we parse it
 * once and hand it to the config applier as an initial full state.
 */

import {
	bindDefaultCopyHandler,
	bindDefaultPasteHandler,
} from "neuroglancer/unstable/ui/default_clipboard_handling.js";
import { setDefaultInputEventBindings } from "neuroglancer/unstable/ui/default_input_event_bindings.js";
import { makeDefaultViewer } from "neuroglancer/unstable/ui/default_viewer.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

import type { ViewerStateJson } from "../protocol.js";

export function createViewer(target: HTMLElement): Viewer {
	const viewer = makeDefaultViewer({
		target,
		// The viewer is driven externally by MyOcean via CONFIG. Disable the
		// built-in "empty viewer" behaviour, which otherwise debounces and forces
		// the layout back to "4panel-alt" and opens a new-layer dialog whenever no
		// layers are present — clobbering programmatic / hash-seeded state.
		resetStateWhenEmpty: false,
		showLayerDialog: false,
	});
	setDefaultInputEventBindings(viewer.inputEventBindings);
	bindDefaultCopyHandler(viewer);
	bindDefaultPasteHandler(viewer);

	// Default the area outside the data (the slice / 3D background) to black.
	// Set before the ConfigApplier captures the pristine state, so it persists
	// across CONFIGs unless one explicitly overrides these colors.
	viewer.state.restoreState({
		crossSectionBackgroundColor: "#000000",
		projectionBackgroundColor: "#000000",
	});

	// @ts-expect-error: Expose the viewer globally for debugging
	window.viewer = viewer
	
	return viewer;
}

/**
 * Parse the `#!{JSON}` fragment, if present. Accepts both URL-encoded and raw
 * JSON after the `#!` marker. Returns `undefined` when there is no parseable
 * fragment state.
 */
export function parseHashState(hash: string): ViewerStateJson | undefined {
	if (!hash.startsWith("#!")) {
		return undefined;
	}
	const fragment = hash.slice(2);
	if (fragment.length === 0) {
		return undefined;
	}
	for (const candidate of [decodeURIComponentSafe(fragment), fragment]) {
		if (candidate === undefined) continue;
		try {
			const parsed: unknown = JSON.parse(candidate);
			if (typeof parsed === "object" && parsed !== null) {
				return parsed as ViewerStateJson;
			}
		} catch {
			// try next candidate
		}
	}
	// eslint-disable-next-line no-console
	console.warn("[ocean-viewer] could not parse #! hash state");
	return undefined;
}

function decodeURIComponentSafe(s: string): string | undefined {
	try {
		return decodeURIComponent(s);
	} catch {
		return undefined;
	}
}
