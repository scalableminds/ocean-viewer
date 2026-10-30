/**
 * Creates the Neuroglancer viewer and parses the one-off `#!{JSON}` URL hash.
 *
 * Omits Neuroglancer's live two-way `UrlHashBinding`: in an iframe driven by
 * postMessage, that would fight inbound CONFIG by re-asserting the URL hash.
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
import type { RegisteredSidePanel } from "neuroglancer/unstable/ui/side_panel.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";
import {
	disableRotationBindings,
	swapWheelBindings,
} from "./input-bindings.js";
import { THREE_PANEL_LAYOUT } from "./three-panel-layout.js";

/** Fallback when the layout being normalised doesn't name a type itself. */
const DEFAULT_LAYOUT_TYPE = THREE_PANEL_LAYOUT;

export function createViewer(target: HTMLElement): Viewer {
	const viewer = makeDefaultViewer({
		target,
		// Driven externally via CONFIG; disable Neuroglancer's "empty viewer"
		// behaviour (layout reset + new-layer dialog), which would otherwise
		// clobber programmatic / hash-seeded state.
		resetStateWhenEmpty: false,
		showLayerDialog: false,
		// Drop the whole top row: the position / mouse-position readouts
		showTopBar: false,
	});
	setDefaultInputEventBindings(viewer.inputEventBindings);
	// Wheel zooms, ctrl + wheel moves through the third dimension — the inverse
	// of Neuroglancer's defaults — and shift + direction no longer tilts a
	// cross-section out of axis alignment.
	swapWheelBindings();
	disableRotationBindings();
	bindDefaultCopyHandler(viewer);
	bindDefaultPasteHandler(viewer);
	suppressSidePanels(viewer);

	// Set before ConfigApplier captures the pristine state, so these persist
	// across CONFIGs unless explicitly overridden.
	viewer.state.restoreState({
		hideCrossSectionBackground3D: true,
		crossSectionBackgroundColor: "#000000",
		projectionBackgroundColor: "#000000",
		showScaleBar: false,
		// Data-axis rays from the centre; `section-lines.ts` draws the cuts instead
		showAxisLines: false,
		// The yellow outline Neuroglancer draws around the dataset bounds
		showDefaultAnnotations: false,
		layout: withOrthographicDefault(THREE_PANEL_LAYOUT),
	});

	// @ts-expect-error: Expose the viewer globally for debugging
	window.viewer = viewer;

	return viewer;
}

/**
 * Keep every Neuroglancer side panel (layer settings, selection, help, …) closed.
 *
 * They open from many places — right-click or ctrl+click on a layer tab, key
 * bindings, a `selectedLayer` in CONFIG — so close them all just before each
 * layout pass instead of chasing every trigger.
 */
function suppressSidePanels(viewer: Viewer): void {
	const manager = viewer.sidePanelManager;
	// `registeredPanels` is private in the typings; it also holds per-layer
	// panels registered later.
	const { registeredPanels } = manager as unknown as {
		registeredPanels: Set<RegisteredSidePanel>;
	};
	manager.beforeRender.add(() => {
		for (const { location } of registeredPanels) {
			location.visible = false;
		}
	});
}

/**
 * Expand a layout to the Ocean Viewer default of an orthographic 3D camera,
 * honouring an explicit `orthographicProjection: false`.
 *
 * Neuroglancer resets the camera type on every layout restore, so this has to
 * re-attach the flag rather than set it once.
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
