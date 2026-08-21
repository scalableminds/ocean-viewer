/**
 * Applies inbound CONFIG messages to the Neuroglancer viewer state.
 *
 * Deliberately avoids `state.reset()`: resetting then restoring an incomplete
 * state leaves the viewer inconsistent and it snaps back to its prior layout.
 * Instead the pristine default state is captured once at startup, and a full
 * replace is `restoreState({...pristine, ...state})` — always complete.
 *
 *   - full    : replace everything; keys absent from `state` fall back to the
 *               pristine default (clears stale layers etc.).
 *   - partial : merge `state` onto the current state, preserving camera
 *               position/orientation/zoom unless the partial names them.
 *
 * Also remembers the 3D zoom the latest config asked for, which the ⌂ button in
 * `viewport-controls.ts` restores to in place of Neuroglancer's own default.
 */

import { resolveStateColormaps } from "@ocean-viewer/colormaps/shader";
import type { ConfigMessage, ViewerStateJson } from "@ocean-viewer/protocol";
import type { Viewer } from "neuroglancer/unstable/viewer.js";
import { DisplayScales } from "./display-scales.js";
import { withOrthographicDefault } from "./viewer.js";

const PRESERVED_CAMERA_KEYS: ReadonlyArray<keyof ViewerStateJson> = [
	"position",
	"projectionOrientation",
	"projectionScale",
	"projectionDepth",
	"crossSectionOrientation",
	"crossSectionScale",
	"crossSectionDepth",
];

export class ConfigApplier {
	/** Pristine default state captured before any config is applied. */
	private readonly pristine: ViewerStateJson;
	private hasReceivedFull = false;

	/**
	 * The 3D zoom the most recent CONFIG asked for, if any — what the ⌂ button
	 * restores to instead of Neuroglancer's fit-the-data default. A full config
	 * that omits it falls back to the pristine default, so it clears this too.
	 */
	private configuredProjectionScale: number | undefined;

	/** Vertical exaggeration and its zoom damping; see `display-scales.ts`. */
	private readonly displayScales: DisplayScales;

	get projectionScale(): number | undefined {
		return this.configuredProjectionScale;
	}

	constructor(private readonly viewer: Viewer) {
		this.pristine = viewer.state.toJSON() as ViewerStateJson;
		this.displayScales = new DisplayScales(viewer);
	}

	apply(message: ConfigMessage): void {
		const mode = message.mode ?? (this.hasReceivedFull ? "partial" : "full");
		// Convert any `oceanColormap` layer fields into Neuroglancer `shader`s.
		const resolved = resolveStateColormaps(message.state);
		// A restored layout resets Neuroglancer's `orthographicProjection` flag, so
		// re-assert our default whenever a CONFIG names a layout.
		const withLayout: ViewerStateJson =
			resolved.layout === undefined
				? resolved
				: { ...resolved, layout: withOrthographicDefault(resolved.layout) };
		// `oceanZoomDamping` is ours; it never reaches `restoreState`.
		const { oceanZoomDamping, ...state } = withLayout;
		try {
			if (mode === "full") {
				this.viewer.state.restoreState({ ...this.pristine, ...state });
				this.hasReceivedFull = true;
				this.configuredProjectionScale = state.projectionScale;
			} else {
				this.applyPartial(state);
				if (state.projectionScale !== undefined) {
					this.configuredProjectionScale = state.projectionScale;
				}
			}
			// A `restoreState` clears `relativeDisplayScales` unless this state
			// named it, so re-assert it from here on.
			if (mode === "full") {
				this.displayScales.set(state.relativeDisplayScales, oceanZoomDamping);
			} else {
				this.displayScales.patch({
					...(state.relativeDisplayScales !== undefined
						? { base: state.relativeDisplayScales }
						: {}),
					...(oceanZoomDamping !== undefined
						? { damping: oceanZoomDamping }
						: {}),
				});
			}
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error(
				"[ocean-viewer] failed to apply CONFIG",
				err,
				message.state,
			);
		}
	}

	private applyPartial(state: ViewerStateJson): void {
		const current = this.viewer.state.toJSON() as ViewerStateJson;
		const merged: ViewerStateJson = { ...state };
		for (const key of PRESERVED_CAMERA_KEYS) {
			if (!(key in state) && key in current) {
				copyKey(merged, current, key);
			}
		}
		this.viewer.state.restoreState(merged);
	}
}

/**
 * Copy one same-named key between two values of the same type.
 *
 * A plain `target[key] = source[key]` doesn't type-check when `key` is a
 * generic `keyof T`; routing it through a function generic over `T`/`K
 * extends keyof T` gives TS back the correlation it needs.
 */
function copyKey<T, K extends keyof T>(target: T, source: T, key: K): void {
	target[key] = source[key];
}
