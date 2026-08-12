/**
 * Small button clusters overlaid on a panel's top-right corner. The Ocean Viewer
 * hides Neuroglancer's own per-panel controls and its key bindings are
 * undiscoverable in an iframe, so anything the user needs to reach has to be a
 * visible button.
 *
 * On the 3D panel, for recovering a camera tumbled by an undoable left-drag:
 *
 *   ⌂   reset — identity orientation plus a zoom recomputed to fit the data
 *   XY  ·  XZ  ·  YZ — align the camera with that principal plane
 *
 * Only the orientation (and, for ⌂, the zoom) is touched — the perspective
 * navigation state shares its `Position` with the cross-section one, so
 * resetting it would drag the three 2D panels along with the 3D camera.
 *
 * On the XY cross-section, for turning the data within the viewing plane —
 * the one rotation the Ocean Viewer keeps, now that `input-bindings.ts` has
 * removed the gestures that did it by accident:
 *
 *   ↺  ·  ↻ — rotate by {@link ROTATION_STEP_DEGREES}° per press
 */

import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { NavigationState } from "neuroglancer/unstable/navigation_state.js";
import type { RenderedDataPanel } from "neuroglancer/unstable/rendered_data_panel.js";
import { kAxes, quat } from "neuroglancer/unstable/util/geom.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

const CONTROLS_CLASS = "ocean-viewport-controls";

/** Turn per press of ↺ / ↻, small enough to nudge a map into alignment. */
const ROTATION_STEP_DEGREES = 15;

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
	 * Panels don't exist yet during bootstrap, and a layout change later tears
	 * them all down and rebuilds them with no signal to hook — so the overlay is
	 * reconciled from DOM mutations instead, same as `units.ts`.
	 *
	 * Deliberately no debounce: `apply` is idempotent and cheap, and coalescing
	 * onto an animation frame would be worse — `requestAnimationFrame` doesn't
	 * fire while the page is hidden, so a backgrounded iframe would never get
	 * its buttons.
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

	/** Ensure the 3D panel and the XY cross-section each carry one overlay. */
	private readonly apply = (): void => {
		for (const panel of this.viewer.display.panels) {
			if (panel.element.querySelector(`:scope > .${CONTROLS_CLASS}`) !== null) {
				continue;
			}
			if (this.isPerspectivePanel(panel)) {
				panel.element.appendChild(this.buildCameraControls());
			} else if (this.isXyPanel(panel)) {
				panel.element.appendChild(this.buildRotationControls(panel));
			}
		}
	};

	/**
	 * Identify the 3D panel by the input bindings it was wired with, rather than
	 * with `instanceof PerspectivePanel` — a layer group hands each panel a
	 * linked copy of its navigation state, but the event maps pass through as-is.
	 */
	private isPerspectivePanel(panel: RenderedPanel): panel is RenderedDataPanel {
		return (
			(panel as RenderedPanel & { inputEventMap?: unknown }).inputEventMap ===
			this.viewer.inputEventBindings.perspectiveView
		);
	}

	/**
	 * Identify the XY cross-section by its orientation. Neuroglancer builds that
	 * panel straight on the layer group's own pose and derives xz / yz from it
	 * with a fixed quarter turn, so it is the one cross-section whose orientation
	 * matches the viewer's — which stays true after the data has been rotated.
	 *
	 * A layout without an XY panel (`xz`, `yz`) simply gets no rotation buttons.
	 */
	private isXyPanel(panel: RenderedPanel): panel is RenderedDataPanel {
		const candidate = panel as RenderedPanel & {
			inputEventMap?: unknown;
			navigationState?: NavigationState;
		};
		if (
			candidate.inputEventMap !== this.viewer.inputEventBindings.sliceView ||
			candidate.navigationState === undefined
		) {
			return false;
		}
		return quat.equals(
			candidate.navigationState.pose.orientation.orientation,
			this.viewer.navigationState.pose.orientation.orientation,
		);
	}

	/** A cluster shell: positioned by CSS, and inert as far as the panel knows. */
	private cluster(): HTMLElement {
		const root = document.createElement("div");
		root.className = CONTROLS_CLASS;
		root.setAttribute(OVERLAY_ATTRIBUTE, "");

		// The panel binds mousedown/wheel to camera drag/zoom on this same element;
		// without this a button press would also start tumbling the camera.
		for (const type of ["mousedown", "click", "wheel", "dblclick"] as const) {
			root.addEventListener(type, (event) => event.stopPropagation());
		}

		return root;
	}

	/**
	 * Turning the cross-section's own pose, rather than the viewer's, is what
	 * keeps this working when a layer group's navigation state is unlinked from
	 * the viewer's. Neuroglancer mirrors the turn onto the xz / yz panels, since
	 * their orientations are derived from this one; the 3D camera has its own
	 * orientation and stays put.
	 */
	private buildRotationControls(panel: RenderedDataPanel): HTMLElement {
		const root = this.cluster();
		const rotate = (sign: number) => () => {
			panel.navigationState.pose.rotateRelative(
				kAxes[2],
				(sign * ROTATION_STEP_DEGREES * Math.PI) / 180,
			);
		};
		root.appendChild(
			this.button(
				"↺",
				`Rotate the data ${ROTATION_STEP_DEGREES}° counter-clockwise`,
				rotate(1),
			),
		);
		root.appendChild(
			this.button(
				"↻",
				`Rotate the data ${ROTATION_STEP_DEGREES}° clockwise`,
				rotate(-1),
			),
		);
		return root;
	}

	private buildCameraControls(): HTMLElement {
		const root = this.cluster();

		root.appendChild(
			this.button("⌂", "Reset the 3D camera (orientation and zoom)", () => {
				const { pose, zoomFactor } = this.viewer.perspectiveNavigationState;
				pose.orientation.reset();
				// Sets the value to NaN, so the next read recomputes the default zoom.
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
