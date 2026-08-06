/**
 * Emits CLICK and HOVER messages for the position under the pointer and the
 * value each visible layer has there.
 *
 * Both read the same two things from Neuroglancer:
 *   - `mouseState.position` — the global-coordinate position under the cursor
 *   - `layerSelectedValues` — per-layer value there, the same source that feeds
 *     the built-in hover readouts and selection panel
 *
 * Click vs. drag: Neuroglancer binds plain left-drag in the data panels to
 * panning/rotating, and a pan ends with a DOM `click` like any other press and
 * release on the same element. So the press position is remembered and the click
 * only counts if the pointer barely moved — a pan is not a click.
 *
 * Nothing is emitted unless Neuroglancer has a valid picked position under the
 * cursor (`mouseState.active`). The panels set that up on mouse move and drop it
 * on mouse out, so clicks on Neuroglancer's own UI chrome never report. It also
 * means the pointer has to move once after a CONFIG rebuilds the panels before
 * the first click/hover lands: until those panels have redrawn there is no pick
 * data to read, and inventing a position from stale data would be worse than
 * silence.
 *
 * That gate does not cover chrome the Ocean wrapper injects *inside* a panel
 * (the 3D viewport's camera buttons), where the pick stays valid the whole time.
 * Those are excluded by target instead. It has to happen here rather than by
 * stopping propagation at the overlay: these listeners are on `viewer.element`
 * in the capture phase, so they run before the overlay's own handlers.
 */

import type { LayerValue, PointerSample } from "@ocean-viewer/protocol";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

import type { Bridge } from "./bridge.js";
import { OVERLAY_ATTRIBUTE } from "./viewport-controls.js";

/** Pointer travel (px) between press and release still counted as a click. */
const CLICK_SLOP_PX = 4;

/**
 * Minimum gap between HOVER messages. Neuroglancer completes a pick per frame
 * while the pointer moves, so unthrottled this would be ~60 messages/s; 100 ms
 * keeps a readout feeling live at a tenth of the traffic.
 */
const DEFAULT_HOVER_INTERVAL_MS = 100;

export class PointerForwarder {
	private downX = 0;
	private downY = 0;

	private hoverTimer: ReturnType<typeof setTimeout> | undefined;
	private lastHoverAt = Number.NEGATIVE_INFINITY;
	private lastHoverKey: string | undefined;

	constructor(
		private readonly viewer: Viewer,
		private readonly bridge: Bridge,
		private readonly hoverIntervalMs = DEFAULT_HOVER_INTERVAL_MS,
	) {
		// Capture phase: the data panels stop propagation of their own mouse
		// events, and they are descendants of `viewer.element`.
		viewer.element.addEventListener("mousedown", this.handleMouseDown, true);
		viewer.element.addEventListener("click", this.handleClick, true);
		viewer.mouseState.changed.add(this.scheduleHover);
	}

	dispose(): void {
		const { element, mouseState } = this.viewer;
		element.removeEventListener("mousedown", this.handleMouseDown, true);
		element.removeEventListener("click", this.handleClick, true);
		mouseState.changed.remove(this.scheduleHover);
		if (this.hoverTimer !== undefined) {
			clearTimeout(this.hoverTimer);
		}
	}

	private readonly handleMouseDown = (event: MouseEvent): void => {
		this.downX = event.clientX;
		this.downY = event.clientY;
	};

	private readonly handleClick = (event: MouseEvent): void => {
		if (isOverlayEvent(event)) {
			return;
		}
		if (
			Math.abs(event.clientX - this.downX) > CLICK_SLOP_PX ||
			Math.abs(event.clientY - this.downY) > CLICK_SLOP_PX
		) {
			return; // A drag (pan/rotate), not a click.
		}
		// A click is a one-off, so it can afford to block on a fresh pick.
		const sample = this.read(true);
		if (sample !== undefined) {
			this.bridge.send({ type: "CLICK", ...sample });
		}
	};

	/**
	 * Throttle HOVER to one message per {@link hoverIntervalMs}, leading edge
	 * plus a trailing send. The trailing send matters more than it looks: without
	 * it the pointer's resting position — the one the user is actually reading —
	 * is the one that gets dropped.
	 */
	private readonly scheduleHover = (): void => {
		if (this.hoverTimer !== undefined) {
			return; // A trailing send is already queued; it will pick up the latest.
		}
		const waited = performance.now() - this.lastHoverAt;
		if (waited >= this.hoverIntervalMs) {
			this.sendHover();
			return;
		}
		this.hoverTimer = setTimeout(
			this.flushHover,
			this.hoverIntervalMs - waited,
		);
	};

	private readonly flushHover = (): void => {
		this.hoverTimer = undefined;
		this.sendHover();
	};

	private sendHover(): void {
		this.lastHoverAt = performance.now();
		const sample = this.read(false);
		if (sample === undefined) {
			return;
		}
		// `mouseState.changed` also fires without the pointer having moved to a new
		// voxel — a re-pick on the same pixel, or chunks arriving. Don't resend an
		// identical readout.
		const key = JSON.stringify(sample);
		if (key === this.lastHoverKey) {
			return;
		}
		this.lastHoverKey = key;
		this.bridge.send({ type: "HOVER", ...sample });
	}

	/**
	 * The position under the pointer and each visible layer's value there, or
	 * `undefined` when Neuroglancer has no valid picked position.
	 *
	 * `force` re-picks synchronously. Pass true for a one-off read like a click;
	 * pass false when reading from a `mouseState.changed` handler — forcing there
	 * would re-enter that same signal, and the state was just recomputed anyway.
	 */
	private read(force: boolean): PointerSample | undefined {
		const { mouseState } = this.viewer;
		const valid = force
			? mouseState.updateUnconditionally()
			: mouseState.active;
		if (!valid) {
			return undefined;
		}
		return {
			world: Array.from(mouseState.position),
			layers: this.readLayerValues(),
		};
	}

	private readLayerValues(): LayerValue[] {
		const { layerManager, layerSelectedValues } = this.viewer;
		const values: LayerValue[] = [];
		for (const managedLayer of layerManager.managedLayers) {
			const userLayer = managedLayer.layer;
			if (!managedLayer.visible || userLayer === null) {
				continue;
			}
			values.push({
				name: managedLayer.name,
				value: normalizeValue(layerSelectedValues.get(userLayer)?.value),
			});
		}
		return values;
	}
}

/** Whether an event originated in UI the Ocean wrapper injected over a panel. */
function isOverlayEvent(event: Event): boolean {
	const target = event.target;
	return (
		target instanceof Element &&
		target.closest(`[${OVERLAY_ATTRIBUTE}]`) !== null
	);
}

/**
 * Coerce a Neuroglancer selected value into something that survives
 * `postMessage` *and* a subsequent `JSON.stringify` on the portal side.
 */
function normalizeValue(value: unknown): LayerValue["value"] {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value === "number") {
		// NaN (missing data) and infinities have no JSON form; report "no value".
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "bigint") {
		// Segmentation ids exceed Number.MAX_SAFE_INTEGER; keep them exact.
		return value.toString();
	}
	if (Array.isArray(value) || ArrayBuffer.isView(value)) {
		// Multi-channel volumes hand back a typed array.
		return Array.from(value as ArrayLike<number>, Number);
	}
	return String(value);
}
