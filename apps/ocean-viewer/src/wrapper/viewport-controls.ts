/**
 * A small button cluster overlaid on the 3D panel for recovering the camera.
 *
 * Neuroglancer's perspective panel rotates freely on left-drag with no undo, and
 * the Ocean Viewer hides Neuroglancer's own per-panel controls (`chrome.css`), so
 * an embedded user who tumbles the camera has no way back. The `z` key snaps to
 * the nearest axis, but a keyboard shortcut is undiscoverable in an iframe.
 *
 *   ⌂   reset — identity orientation plus a zoom recomputed to fit the data
 *   XY  ·  XZ  ·  YZ — align the camera with that principal plane
 *
 * The three axis orientations are Neuroglancer's own (`AXES_RELATIVE_ORIENTATION`
 * in `data_panel_layout.js`), so an axis button lands the camera on exactly the
 * plane the cross-section panel of the same name shows.
 *
 * Only the orientation (and, for ⌂, the zoom) is touched. Position is
 * deliberately left alone: the perspective navigation state shares its `Position`
 * object with the cross-section one, so resetting it would drag the three 2D
 * panels along with the 3D camera.
 */

import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { RenderedDataPanel } from "neuroglancer/unstable/rendered_data_panel.js";
import { quat } from "neuroglancer/unstable/util/geom.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

const CONTROLS_CLASS = "ocean-viewport-controls";

/**
 * Marks DOM injected by the Ocean wrapper rather than by Neuroglancer. Read by
 * `pointer.ts` to tell a button press apart from a click on the data.
 */
export const OVERLAY_ATTRIBUTE = "data-ocean-overlay";

/**
 * Camera orientations for the principal planes, matching Neuroglancer's own
 * `AXES_RELATIVE_ORIENTATION`. `xy` is the identity quaternion.
 */
const AXIS_VIEWS: ReadonlyArray<{
	label: string;
	title: string;
	target: quat;
}> = [
	{
		label: "XY",
		title: "Align camera with the XY plane (top-down)",
		target: quat.create(),
	},
	{
		label: "XZ",
		title: "Align camera with the XZ plane",
		target: quat.rotateX(quat.create(), quat.create(), Math.PI / 2),
	},
	{
		label: "YZ",
		title: "Align camera with the YZ plane",
		target: quat.rotateY(quat.create(), quat.create(), Math.PI / 2),
	},
];

export class ViewportControls {
	private readonly observer: MutationObserver;

	/**
	 * The panels do not exist yet when this runs during bootstrap, and changing
	 * the layout later tears them all down and rebuilds them — with no signal to
	 * hook, since `DisplayContext.addPanel` dispatches none. So the overlay is
	 * reconciled from DOM mutations, the same way `units.ts` tracks the position
	 * widget.
	 *
	 * Deliberately no debounce: `apply` is idempotent and cheap, MutationObserver
	 * already batches records into one callback per microtask, and appending an
	 * overlay just triggers one more callback that finds nothing to do. Coalescing
	 * onto an animation frame would be worse than useless — `requestAnimationFrame`
	 * does not fire while the page is hidden, so an iframe in a background tab (or
	 * scrolled out of view) would never get its buttons.
	 */
	constructor(private readonly viewer: Viewer) {
		this.observer = new MutationObserver(this.apply);
		this.observer.observe(viewer.element, { childList: true, subtree: true });
		this.apply();
	}

	dispose(): void {
		this.observer.disconnect();
		for (const overlay of this.viewer.element.querySelectorAll(
			`.${CONTROLS_CLASS}`,
		)) {
			overlay.remove();
		}
	}

	/** Ensure every perspective panel — and only those — carries one overlay. */
	private readonly apply = (): void => {
		for (const panel of this.viewer.display.panels) {
			if (
				this.isPerspectivePanel(panel) &&
				panel.element.querySelector(`:scope > .${CONTROLS_CLASS}`) === null
			) {
				panel.element.appendChild(this.build());
			}
		}
	};

	/**
	 * Identify the 3D panel by the input bindings it was wired with, rather than
	 * with `instanceof PerspectivePanel`.
	 *
	 * The panels' navigation states are not usable for this — a layer group hands
	 * each panel a *linked* copy rather than the viewer's own object — but the
	 * event maps are passed through as-is.
	 */
	private isPerspectivePanel(panel: RenderedPanel): panel is RenderedDataPanel {
		return (
			(panel as RenderedPanel & { inputEventMap?: unknown }).inputEventMap ===
			this.viewer.inputEventBindings.perspectiveView
		);
	}

	private build(): HTMLElement {
		const root = document.createElement("div");
		root.className = CONTROLS_CLASS;
		root.setAttribute(OVERLAY_ATTRIBUTE, "");

		// The panel binds plain mousedown to rotate-via-mouse-drag and the wheel to
		// zoom, and those listeners sit on the panel element this overlay lives in.
		// Without this a button press would also start tumbling the camera.
		for (const type of ["mousedown", "click", "wheel", "dblclick"] as const) {
			root.addEventListener(type, (event) => event.stopPropagation());
		}

		root.appendChild(
			this.button("⌂", "Reset the 3D camera (orientation and zoom)", () => {
				// Neuroglancer's own reset (viewer.js), minus the shared position.
				const { pose, zoomFactor } = this.viewer.perspectiveNavigationState;
				pose.orientation.reset();
				// Sets the value to NaN, so the next read recomputes the default:
				// the smallest power of two that frames the data bounds.
				zoomFactor.reset();
			}),
		);

		for (const { label, title, target } of AXIS_VIEWS) {
			root.appendChild(
				this.button(label, title, () => {
					// `orientation` is a live gl-matrix quat that nothing observes, so
					// the dispatch has to be explicit.
					const orientation = this.viewer.projectionOrientation;
					quat.copy(orientation.orientation, target);
					orientation.changed.dispatch();
				}),
			);
		}

		return root;
	}

	private button(
		label: string,
		title: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.title = title;
		button.addEventListener("click", onClick);
		return button;
	}
}
