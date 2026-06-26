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

import type { Viewer } from "neuroglancer/unstable/viewer.js";

import type { ConfigMessage, ViewerStateJson } from "../protocol.js";
import { resolveStateColormaps } from "./colormaps.js";
import { setAxisUnits } from "./units.js";

const PRESERVED_CAMERA_KEYS: ReadonlyArray<string> = [
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
		const { oceanAxisUnits, ...rawState } = message.state as ViewerStateJson & {
			oceanAxisUnits?: Record<string, string>;
		};
		if (oceanAxisUnits !== undefined) {
			setAxisUnits(oceanAxisUnits);
		}
		// Convert any `oceanColormap` layer fields into Neuroglancer `shader`s.
		const state = resolveStateColormaps(rawState);
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
				merged[key] = current[key];
			}
		}
		this.viewer.state.restoreState(merged);
	}
}
