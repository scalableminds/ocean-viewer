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

import type {
	DataPanelLayoutJson,
	ViewerStateJson,
} from "@ocean-viewer/protocol";
import {
	bindDefaultCopyHandler,
	bindDefaultPasteHandler,
} from "neuroglancer/unstable/ui/default_clipboard_handling.js";
import { setDefaultInputEventBindings } from "neuroglancer/unstable/ui/default_input_event_bindings.js";
import { makeDefaultViewer } from "neuroglancer/unstable/ui/default_viewer.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

/** Fallback when the layout being normalised doesn't name a type itself. */
const DEFAULT_LAYOUT_TYPE = "4panel-alt";

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

	// Black background outside the data, orthographic 3D camera. Set before the
	// ConfigApplier captures the pristine state, so these persist across CONFIGs
	// unless one explicitly overrides them.
	const current = viewer.state.toJSON() as ViewerStateJson;
	viewer.state.restoreState({
		crossSectionBackgroundColor: "#000000",
		projectionBackgroundColor: "#000000",
		layout: withOrthographicDefault(current.layout),
	});

	// @ts-expect-error: Expose the viewer globally for debugging
	window.viewer = viewer;

	return viewer;
}

/**
 * Expand a layout to the Ocean Viewer default of an orthographic 3D camera,
 * honouring an explicit `orthographicProjection: false`.
 *
 * Neuroglancer keeps the camera type *inside* the layout state and resets it on
 * every layout restore — including the shorthand string form (`"4panel-alt"`),
 * which is why the flag has to be re-attached rather than just set once.
 */
export function withOrthographicDefault(
	layout: ViewerStateJson["layout"],
): DataPanelLayoutJson {
	if (typeof layout === "string" || layout === undefined) {
		return {
			type: layout ?? DEFAULT_LAYOUT_TYPE,
			orthographicProjection: true,
		};
	}
	return { orthographicProjection: true, ...layout };
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
