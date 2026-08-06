/**
 * Applies inbound CONFIG messages to the Neuroglancer viewer state.
 *
 * Neuroglancer's `state.restoreState(json)` merges by top-level key: only the
 * keys present in `json` are applied, and any key it omits keeps its current
 * value. We rely on that and deliberately AVOID `state.reset()`: resetting and
 * then restoring an *incomplete* state (e.g. just `{layout: "xy"}`) leaves the
 * viewer in an inconsistent state that asynchronously snaps back to its prior
 * layout. Instead we capture the pristine default state once at startup and
 * implement a full replace as `restoreState({...pristine, ...state})`, which is
 * always a complete, stable object.
 *
 *   - full    : replace everything; keys absent from `state` fall back to the
 *               pristine default (clears stale layers etc.).
 *   - partial : merge `state` onto the current state, preserving camera
 *               position/orientation/zoom unless the partial names them.
 */

import { resolveStateColormaps } from "@ocean-viewer/colormaps/shader";
import type { ConfigMessage, ViewerStateJson } from "@ocean-viewer/protocol";
import type { Viewer } from "neuroglancer/unstable/viewer.js";
import { setAxisUnits } from "./units.js";
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

	constructor(private readonly viewer: Viewer) {
		this.pristine = viewer.state.toJSON() as ViewerStateJson;
	}

	apply(message: ConfigMessage): void {
		const mode = message.mode ?? (this.hasReceivedFull ? "partial" : "full");
		// Pull off the Ocean Viewer extensions Neuroglancer doesn't understand:
		// `oceanAxisUnits` (X/Y/Z readout unit labels) is applied out-of-band and
		// stripped so it never reaches `restoreState`. Only updated when present,
		// so partial CONFIGs that omit it keep the current units.
		const { oceanAxisUnits, ...rawState } = message.state as ViewerStateJson;
		if (oceanAxisUnits !== undefined) {
			setAxisUnits(oceanAxisUnits);
		}
		// Convert any `oceanColormap` layer fields into Neuroglancer `shader`s.
		const resolved = resolveStateColormaps(rawState);
		// A restored layout resets Neuroglancer's `orthographicProjection` flag, so
		// re-assert our default whenever a CONFIG names a layout.
		const state: ViewerStateJson =
			resolved.layout === undefined
				? resolved
				: { ...resolved, layout: withOrthographicDefault(resolved.layout) };
		try {
			if (mode === "full") {
				this.viewer.state.restoreState({ ...this.pristine, ...state });
				this.hasReceivedFull = true;
			} else {
				this.applyPartial(state);
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
 * generic `keyof T` rather than a literal: TS can't correlate which specific
 * property `key` names, so it can't verify the read from `source` matches
 * what `target` accepts for that same (unknown-to-it) property. Routing the
 * assignment through a function generic over `T`/`K extends keyof T` gives TS
 * that correlation back.
 */
function copyKey<T, K extends keyof T>(target: T, source: T, key: K): void {
	target[key] = source[key];
}
