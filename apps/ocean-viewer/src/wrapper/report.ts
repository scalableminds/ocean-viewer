/**
 * Emits debounced REPORT messages whenever the viewer state changes due to user
 * interaction.
 *
 * Echo suppression: applying an inbound CONFIG also fires `state.changed`. To
 * avoid bouncing that state straight back to the parent, we dedupe against the
 * last serialised state we are aware of. After applying a CONFIG the host calls
 * {@link captureBaseline}, so the subsequent change-triggered flush sees an
 * unchanged state and stays silent. Genuine user edits differ from the baseline
 * and are reported.
 */

import type { Viewer } from "neuroglancer/unstable/viewer.js";

import type { Bridge } from "./bridge.js";

export class Reporter {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private lastSerialized: string | undefined;

	constructor(
		private readonly viewer: Viewer,
		private readonly bridge: Bridge,
		private readonly debounceMs = 300,
	) {
		this.viewer.state.changed.add(this.schedule);
	}

	dispose(): void {
		this.viewer.state.changed.remove(this.schedule);
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
		}
	}

	/** Record the current state as already-known, so it is not echoed back. */
	captureBaseline(): void {
		this.lastSerialized = this.serialize();
	}

	private serialize(): string {
		return JSON.stringify(this.viewer.state.toJSON());
	}

	private readonly schedule = (): void => {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(this.flush, this.debounceMs);
	};

	private readonly flush = (): void => {
		this.timer = undefined;
		const serialized = this.serialize();
		if (serialized === this.lastSerialized) {
			return; // No net change (or an echo of an applied CONFIG).
		}
		this.lastSerialized = serialized;
		this.bridge.send({ type: "REPORT", state: JSON.parse(serialized) });
	};
}
