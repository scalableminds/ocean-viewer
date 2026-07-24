/**
 * Annotate the position widget's X/Y/Z coordinate readouts with physical units.
 *
 * Neuroglancer's coordinate-space units are SI-only — it rejects e.g. `"°"`
 * (`Invalid unit`), which ocean lon/lat need — and its position widget never
 * shows a unit as a clean "value unit" suffix anyway. So units are supplied
 * out-of-band by the Data Portal via the CONFIG extension field
 * `oceanAxisUnits` (a `{ dimensionName: unitString }` map), kept here in a small
 * registry, and rendered as a label appended after each coordinate input.
 *
 * Units are matched by dimension name (the position widget's per-row name
 * input), so they stay correct regardless of axis order. A dimension absent
 * from the map (or mapped to `""`) gets no label.
 */

import type { Viewer } from "neuroglancer/unstable/viewer.js";

const UNIT_LABEL_CLASS = "ocean-unit-label";

let axisUnits: Record<string, string> = {};
let reapply: (() => void) | undefined;

/** Set the dimension-name → unit map (from a CONFIG's `oceanAxisUnits`). */
export function setAxisUnits(units: Record<string, string> | undefined): void {
	axisUnits = units ?? {};
	reapply?.();
}

export function installUnitLabels(_viewer: Viewer): () => void {
	const apply = (): void => {
		for (const dim of document.querySelectorAll<HTMLElement>(
			".neuroglancer-position-dimension",
		)) {
			const nameInput = dim.querySelector<HTMLInputElement>(
				".neuroglancer-position-dimension-name",
			);
			const coord = dim.querySelector<HTMLElement>(
				".neuroglancer-position-dimension-coordinate",
			);
			if (nameInput === null || coord === null) continue;

			const unit = axisUnits[nameInput.value] ?? "";
			let label = dim.querySelector<HTMLElement>(`.${UNIT_LABEL_CLASS}`);

			if (unit === "") {
				label?.remove();
				continue;
			}
			if (label === null) {
				label = document.createElement("span");
				label.className = UNIT_LABEL_CLASS;
				coord.insertAdjacentElement("afterend", label);
			}
			if (label.textContent !== unit) {
				label.textContent = unit;
			}
		}
	};

	reapply = apply;
	apply();

	// The widget's rows are re-rendered on navigation / new CONFIG. `apply` is
	// idempotent, so observing its own mutations settles after one quiet cycle.
	const topRow =
		document.querySelector(".neuroglancer-viewer-top-row") ?? document.body;
	const observer = new MutationObserver(() => apply());
	observer.observe(topRow, { childList: true, subtree: true });

	return () => {
		observer.disconnect();
		if (reapply === apply) reapply = undefined;
	};
}
