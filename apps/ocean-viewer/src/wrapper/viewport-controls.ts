/**
 * Small button clusters overlaid on a panel's top-right corner. The Ocean Viewer
 * hides Neuroglancer's own per-panel controls and its key bindings are
 * undiscoverable in an iframe, so anything the user needs to reach has to be a
 * visible button.
 *
 * On the 3D panel, for recovering a camera tumbled by an undoable left-drag:
 *
 *   ⌂   reset — identity orientation plus the zoom the CONFIG asked for, or,
 *       when it named none, one recomputed to fit the data
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
 *
 * On every cross-section, a fullscreen toggle that switches to the layout of
 * that panel alone and back to the one it was pressed in.
 */

import type { ViewerStateJson } from "@ocean-viewer/protocol";
import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { NavigationState } from "neuroglancer/unstable/navigation_state.js";
import type { RenderedDataPanel } from "neuroglancer/unstable/rendered_data_panel.js";
import { kAxes, quat } from "neuroglancer/unstable/util/geom.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

const CONTROLS_CLASS = "ocean-viewport-controls";

/** Mark the XY panel's two arrows, which CSS tilts in opposite ways. */
const ROTATE_CCW_CLASS = `${CONTROLS_CLASS}-ccw`;
const ROTATE_CW_CLASS = `${CONTROLS_CLASS}-cw`;

/** Marks a button labelled with a symbol instead of a word. */
const GLYPH_CLASS = `${CONTROLS_CLASS}-glyph`;

/** Marks a button labelled with an inline SVG icon. */
const ICON_CLASS = `${CONTROLS_CLASS}-icon`;

/** Corner brackets pointing out (enter fullscreen) and in (exit), 12×12. */
const ENTER_FULLSCREEN_PATH =
	"M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5";
const EXIT_FULLSCREEN_PATH =
	"M4.5 1v3.5H1M7.5 1v3.5H11M11 7.5H7.5V11M1 7.5h3.5V11";

/** Layouts of a single panel, in which a fullscreen toggle has nowhere to go. */
const SINGLE_PANEL_LAYOUTS: ReadonlySet<string> = new Set([
	"xy",
	"xz",
	"yz",
	"3d",
]);

/**
 * Each cross-section's orientation relative to the layer group's pose, keyed
 * by the single-panel layout that shows it — Neuroglancer's
 * `AXES_RELATIVE_ORIENTATION`, which it doesn't export.
 */
const CROSS_SECTIONS: ReadonlyArray<{ layout: string; relative: quat }> = [
	{ layout: "xy", relative: quat.create() },
	{
		layout: "xz",
		relative: quat.rotateX(quat.create(), quat.create(), Math.PI / 2),
	},
	{
		layout: "yz",
		relative: quat.rotateY(quat.create(), quat.create(), Math.PI / 2),
	},
];

/** Slack for float32 round-off when matching a panel's orientation. */
const QUAT_EPSILON = 1e-5;

/** The part of a layer group's `DataPanelLayoutContainer` used here. */
interface DataPanelLayout {
	name: string;
}

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
	 * While a cross-section is fullscreen: the layout to return to, and the
	 * single-panel one we switched to. A layout change from anywhere else (a
	 * CONFIG) forgets both, so the toggle never restores a stale layout.
	 */
	private fullscreen: { from: string; to: string } | undefined;

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
	constructor(
		private readonly viewer: Viewer,
		/**
		 * The 3D zoom ⌂ restores to, read at press time — a later CONFIG can change
		 * it, and the value is only meaningful once one has been applied.
		 */
		private readonly configuredZoom: () => number | undefined = () => undefined,
	) {
		this.observer = new MutationObserver(this.apply);
		this.observer.observe(viewer.element, { childList: true, subtree: true });
		viewer.layout.changed.add(this.forgetStaleFullscreen);
		this.apply();
	}

	dispose(): void {
		this.observer.disconnect();
		this.viewer.layout.changed.remove(this.forgetStaleFullscreen);
		for (const overlay of this.viewer.element.querySelectorAll(
			`.${CONTROLS_CLASS}`,
		)) {
			overlay.remove();
		}
	}

	/** Ensure the 3D panel and each cross-section carry one overlay. */
	private readonly apply = (): void => {
		for (const panel of this.viewer.display.panels) {
			if (panel.element.querySelector(`:scope > .${CONTROLS_CLASS}`) !== null) {
				continue;
			}
			if (this.isPerspectivePanel(panel)) {
				panel.element.appendChild(this.buildCameraControls());
			} else {
				const controls = this.buildCrossSectionControls(panel);
				if (controls !== undefined) panel.element.appendChild(controls);
			}
		}
	};

	/**
	 * Run `apply` (a CONFIG) without dropping a fullscreen panel, unless the
	 * CONFIG asks for a different layout than the one fullscreen was entered
	 * from. The portal re-sends a full state on every layer edit, and a full
	 * state always restores a layout, so without this any edit would exit.
	 *
	 * The layout to exit to becomes the one the CONFIG left, since a full state
	 * that omits `layout` falls back to the pristine one.
	 */
	keepFullscreenAcross(
		requested: ViewerStateJson["layout"],
		apply: () => void,
	): void {
		const { fullscreen } = this;
		apply();
		if (fullscreen === undefined) return;
		const requestedType =
			typeof requested === "string" ? requested : requested?.type;
		if (requestedType !== undefined && requestedType !== fullscreen.from) {
			return;
		}
		const layout = this.dataPanelLayout();
		if (layout === undefined || SINGLE_PANEL_LAYOUTS.has(layout.name)) return;
		// Set first, so the layout change below doesn't read as stale.
		this.fullscreen = { from: layout.name, to: fullscreen.to };
		layout.name = fullscreen.to;
	}

	private readonly forgetStaleFullscreen = (): void => {
		if (this.fullscreen?.to !== this.dataPanelLayout()?.name) {
			this.fullscreen = undefined;
		}
	};

	/**
	 * The layout container of the viewer's one layer group, or undefined when
	 * the layout splits the viewer into several groups — which the Ocean Viewer
	 * never asks for, so no fullscreen toggle is offered there.
	 */
	private dataPanelLayout(): DataPanelLayout | undefined {
		const { component } = this.viewer.layout.container as unknown as {
			component?: { layerGroupViewer?: { layout: DataPanelLayout } };
		};
		return component?.layerGroupViewer?.layout;
	}

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
	 * Name a cross-section by its orientation: `xy`, `xz` or `yz`, or undefined
	 * for any other panel. Neuroglancer builds the XY panel straight on the layer
	 * group's own pose and derives xz / yz from it with a fixed quarter turn, so
	 * the turn between the two identifies the panel — which stays true after the
	 * data has been rotated.
	 */
	private crossSectionOf(panel: RenderedPanel): string | undefined {
		const candidate = panel as RenderedPanel & {
			inputEventMap?: unknown;
			navigationState?: NavigationState;
		};
		if (
			candidate.inputEventMap !== this.viewer.inputEventBindings.sliceView ||
			candidate.navigationState === undefined
		) {
			return undefined;
		}
		const relative = quat.multiply(
			quat.create(),
			quat.invert(
				quat.create(),
				this.viewer.navigationState.pose.orientation.orientation,
			),
			candidate.navigationState.pose.orientation.orientation,
		);
		return CROSS_SECTIONS.find(
			// Unit quaternions for the same turn have |dot| = 1, whichever of `q` and
			// `-q` each is.
			(section) =>
				Math.abs(quat.dot(relative, section.relative)) > 1 - QUAT_EPSILON,
		)?.layout;
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
	 * Rotation buttons on the XY panel, and a fullscreen toggle on every
	 * cross-section that has somewhere to toggle to. Undefined when neither
	 * applies, e.g. a CONFIG-chosen `xz` layout.
	 */
	private buildCrossSectionControls(
		panel: RenderedPanel,
	): HTMLElement | undefined {
		const section = this.crossSectionOf(panel);
		if (section === undefined) return undefined;
		const root = this.cluster();
		if (section === "xy") {
			this.appendRotationButtons(root, panel as RenderedDataPanel);
		}
		const fullscreen = this.buildFullscreenButton(section);
		if (fullscreen !== undefined) root.appendChild(fullscreen);
		return root.childElementCount > 0 ? root : undefined;
	}

	/**
	 * Turning the cross-section's own pose, rather than the viewer's, is what
	 * keeps this working when a layer group's navigation state is unlinked from
	 * the viewer's. Neuroglancer mirrors the turn onto the xz / yz panels, since
	 * their orientations are derived from this one; the 3D camera has its own
	 * orientation and stays put.
	 */
	private appendRotationButtons(
		root: HTMLElement,
		panel: RenderedDataPanel,
	): void {
		const rotate = (sign: number) => () => {
			panel.navigationState.pose.rotateRelative(
				kAxes[2],
				(sign * ROTATION_STEP_DEGREES * Math.PI) / 180,
			);
		};
		// The classes are what CSS tilts the two arrows by, each towards the way it
		// turns.
		const ccw = this.button(
			"↺",
			`Rotate the data ${ROTATION_STEP_DEGREES}° counter-clockwise`,
			rotate(1),
			true,
		);
		ccw.classList.add(ROTATE_CCW_CLASS);
		const cw = this.button(
			"↻",
			`Rotate the data ${ROTATION_STEP_DEGREES}° clockwise`,
			rotate(-1),
			true,
		);
		cw.classList.add(ROTATE_CW_CLASS);
		root.append(ccw, cw);
	}

	/**
	 * Fullscreen within the viewer, as a switch to the single-panel layout of
	 * this section — Neuroglancer's own maximize, whose buttons `chrome.css`
	 * hides. The browser's Fullscreen API would need the portal's iframe to
	 * allow it, and would take the legends and controls around it away too.
	 *
	 * Only the layout type changes, so the 3D camera type and the rest of the
	 * layout survive the round trip. The panels are rebuilt either way, and the
	 * new one gets its button, in the other state, from {@link apply}. The
	 * container is looked up again on press, in case a CONFIG replaced it.
	 */
	private buildFullscreenButton(
		section: string,
	): HTMLButtonElement | undefined {
		const layout = this.dataPanelLayout();
		if (layout === undefined) return undefined;
		const { fullscreen } = this;
		if (fullscreen !== undefined) {
			return this.iconButton(EXIT_FULLSCREEN_PATH, "Exit fullscreen", () => {
				this.fullscreen = undefined;
				const current = this.dataPanelLayout();
				if (current !== undefined) current.name = fullscreen.from;
			});
		}
		if (SINGLE_PANEL_LAYOUTS.has(layout.name)) return undefined;
		return this.iconButton(
			ENTER_FULLSCREEN_PATH,
			"Show this panel fullscreen",
			() => {
				const current = this.dataPanelLayout();
				if (current === undefined) return;
				// Set first, so the layout change it causes doesn't read as stale.
				this.fullscreen = { from: current.name, to: section };
				current.name = section;
			},
		);
	}

	private buildCameraControls(): HTMLElement {
		const root = this.cluster();

		root.appendChild(
			this.button(
				"⌂",
				"Reset the 3D camera (orientation and zoom)",
				() => {
					const { pose, zoomFactor } = this.viewer.perspectiveNavigationState;
					pose.orientation.reset();
					const configured = this.configuredZoom();
					if (configured === undefined) {
						// Sets the value to NaN, so the next read recomputes the default zoom.
						zoomFactor.reset();
					} else {
						zoomFactor.value = configured;
					}
				},
				true,
			),
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

	/**
	 * A `glyph` button carries a symbol rather than a word, which needs a larger
	 * font size to read at all. Its label goes in a span of its own, so that a
	 * tilted symbol doesn't tilt the button's hover background with it.
	 */
	private button(
		label: string,
		title: string,
		onClick: () => void,
		glyph = false,
	): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.title = title;
		button.addEventListener("click", onClick);
		if (glyph) {
			button.classList.add(GLYPH_CLASS);
			const symbol = document.createElement("span");
			symbol.textContent = label;
			button.appendChild(symbol);
		} else {
			button.textContent = label;
		}
		return button;
	}

	private iconButton(
		path: string,
		title: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = this.button("", title, onClick);
		button.classList.add(ICON_CLASS);
		const ns = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(ns, "svg");
		svg.setAttribute("viewBox", "0 0 12 12");
		svg.setAttribute("aria-hidden", "true");
		const stroke = document.createElementNS(ns, "path");
		stroke.setAttribute("d", path);
		svg.appendChild(stroke);
		button.appendChild(svg);
		return button;
	}
}
