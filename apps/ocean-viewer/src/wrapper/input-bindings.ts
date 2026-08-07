/**
 * Ocean Viewer input gestures for the data panels.
 *
 * Neuroglancer's defaults treat the wheel as a depth control: a bare wheel
 * steps one voxel along the third dimension (`shift` + wheel steps ten), and
 * `ctrl` + wheel zooms. Ocean Viewer swaps the two, so the wheel zooms like it
 * does in a map viewer and `ctrl` + wheel walks the third dimension.
 *
 * The cross-section planes are also fixed to the data axes, so the gestures
 * that tilt them out of alignment are removed.
 *
 * `alt` + wheel (depth range) and the touch gestures are left alone.
 */

import {
	getDefaultRenderedDataPanelBindings,
	getDefaultSliceViewPanelBindings,
} from "neuroglancer/unstable/ui/default_input_event_bindings.js";

/**
 * Rebind the wheel actions on the shared "All Data Panels" event map — the
 * parent of both the cross-section and 3D panel maps.
 *
 * Patching that map, rather than shadowing it with per-panel bindings, keeps a
 * single source of truth: the help panel (`h`) walks the map hierarchy and
 * would otherwise list the replaced defaults alongside the replacements.
 * `set` overwrites, so calling this more than once is harmless.
 *
 * Beware: a macOS trackpad pinch reaches the browser as a `ctrl` + wheel event,
 * so pinching now steps through the third dimension instead of zooming.
 */
export function swapWheelBindings(): void {
	const bindings = getDefaultRenderedDataPanelBindings();

	// Phase prefixes match the defaults being replaced. Zoom stays `at:`-only,
	// so a wheel over a child element of a panel still scrolls that element;
	// `ctrl` + wheel keeps the default's `at:` + `bubble:` reach, which is what
	// suppresses the browser's own page zoom anywhere in a panel.
	//
	// `shift?` folds the former ten-step gesture into plain zoom, and the ten-step
	// version moves over to `ctrl` + `shift` to stay an accelerator of the
	// gesture it belongs to.
	bindings.set("at:shift?+wheel", {
		action: "zoom-via-wheel",
		preventDefault: true,
	});
	bindings.set("control+wheel", {
		action: "z+1-via-wheel",
		preventDefault: true,
	});
	bindings.set("control+shift+wheel", {
		action: "z+10-via-wheel",
		preventDefault: true,
	});
}

/**
 * Drop the gestures that rotate a panel's viewing plane: `shift` + arrow keys
 * and a two-finger twist (all panels), plus `shift` + left-drag (cross-sections
 * only — the 3D panel binds that one to translation).
 *
 * They become dead gestures — no parent map binds them — rather than falling
 * back to their unmodified counterparts, so a stray `shift` does nothing at all
 * instead of quietly panning or stepping.
 *
 * Tumbling the 3D camera is untouched, by mouse drag or by one-finger touch
 * drag, and so are `r` / `e` (in-plane rotation by keyboard).
 */
export function disableRotationBindings(): void {
	const bindings = getDefaultRenderedDataPanelBindings();
	for (const arrow of ["up", "down", "left", "right"]) {
		bindings.delete(`shift+arrow${arrow}`);
	}
	// Two-finger twist. Bound once for all panels, so this covers the in-plane
	// rotation of both the cross-sections and the 3D projection.
	bindings.delete("at:touchrotate");
	getDefaultSliceViewPanelBindings().delete("at:shift+mousedown0");
}
