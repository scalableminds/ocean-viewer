/** Panel lookups shared by the overlays and camera controls. */

import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { RenderedDataPanel } from "neuroglancer/unstable/rendered_data_panel.js";
import { quat } from "neuroglancer/unstable/util/geom.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

/**
 * Identify the 3D panel by the input bindings it was wired with, rather than
 * with `instanceof PerspectivePanel` — a layer group hands each panel a
 * linked copy of its navigation state, but the event maps pass through as-is.
 */
export function isPerspectivePanel(
	viewer: Viewer,
	panel: RenderedPanel,
): panel is RenderedDataPanel {
	return (
		(panel as RenderedPanel & { inputEventMap?: unknown }).inputEventMap ===
		viewer.inputEventBindings.perspectiveView
	);
}

/** `orientation` relative to the viewer's cross-section pose, into `out`. */
export function relativeToPose(
	viewer: Viewer,
	orientation: quat,
	out: quat = quat.create(),
): quat {
	quat.invert(out, viewer.navigationState.pose.orientation.orientation);
	return quat.multiply(out, out, orientation);
}
