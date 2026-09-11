/**
 * A caption in each cross-section panel's top-left corner naming the two
 * dataset dimensions that panel spans — horizontal first, e.g. `x · elevation`
 * for the XZ section of a lon/lat/elevation cube.
 *
 * Neuroglancer's own per-panel axis overlay is hidden by `chrome.css`, and in
 * a layout of three look-alike black panels there is otherwise nothing to say
 * which is which. Names come from the data rather than the fixed XY / XZ / YZ
 * of the 3D panel's align buttons, since what the user wants to recognise is
 * their own axes ("elevation"), not our letters for them.
 *
 * The caption is `pointer-events: none` in CSS, so it stays out of the way of
 * dragging and of `pointer.ts`'s click forwarding.
 */

import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { NavigationState } from "neuroglancer/unstable/navigation_state.js";
import { kAxes, vec3 } from "neuroglancer/unstable/util/geom.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

const LABEL_CLASS = "ocean-viewport-label";

/** Separates the two dimension names. */
const SEPARATOR = " · ";

/**
 * Stand-in for a display axis whose dimension the viewer can't name — fewer
 * than three display dimensions, or a coordinate space not resolved yet. Reads
 * as the plane names the align buttons use (`X` + `Y` → the XY section).
 */
const AXIS_LETTERS = ["X", "Y", "Z"] as const;

/** A cross-section panel and the caption reconciled onto it. */
interface Entry {
	element: HTMLElement;
	navigationState: NavigationState;
	/** Detaches the orientation subscription when the panel goes away. */
	dispose: () => void;
}

export class ViewportLabels {
	private readonly observer: MutationObserver;
	private readonly entries = new Map<RenderedPanel, Entry>();

	/**
	 * Panels are built after bootstrap and rebuilt wholesale on a layout change
	 * with no signal to hook, so the captions are reconciled from DOM mutations —
	 * same as `viewport-controls.ts`, and undebounced for the same reasons.
	 *
	 * The text on top of that tracks two things the DOM says nothing about: the
	 * dimension names, which a CONFIG can replace, and the pose, since turning a
	 * section far enough swaps which dimension runs across the screen.
	 */
	constructor(private readonly viewer: Viewer) {
		this.observer = new MutationObserver(this.apply);
		this.observer.observe(viewer.element, { childList: true, subtree: true });
		viewer.displayDimensionRenderInfo.changed.add(this.apply);
		this.apply();
	}

	dispose(): void {
		this.observer.disconnect();
		this.viewer.displayDimensionRenderInfo.changed.remove(this.apply);
		for (const [panel, entry] of this.entries) {
			entry.dispose();
			entry.element.remove();
			this.entries.delete(panel);
		}
	}

	private readonly apply = (): void => {
		const panels = this.viewer.display.panels;
		for (const [panel, entry] of this.entries) {
			if (!panels.has(panel)) {
				entry.dispose();
				this.entries.delete(panel);
			}
		}
		for (const panel of panels) {
			const navigationState = this.crossSectionStateOf(panel);
			if (navigationState === undefined) continue;
			let entry = this.entries.get(panel);
			if (entry === undefined) {
				const element = document.createElement("div");
				element.className = LABEL_CLASS;
				panel.element.appendChild(element);
				const orientation = navigationState.pose.orientation;
				orientation.changed.add(this.apply);
				entry = {
					element,
					navigationState,
					dispose: () => orientation.changed.remove(this.apply),
				};
				this.entries.set(panel, entry);
			}
			const text = this.captionFor(entry.navigationState);
			// Writing unconditionally would feed this observer its own mutation for
			// ever; comparing first lets it settle after one pass.
			if (entry.element.textContent !== text) {
				entry.element.textContent = text;
			}
		}
	};

	/**
	 * The navigation state of a cross-section panel, or undefined for the 3D one
	 * — whose camera looks anywhere, so no two dimensions name it.
	 *
	 * Identified by the input bindings it was wired with rather than with
	 * `instanceof SliceViewPanel`, as in `viewport-controls.ts`.
	 */
	private crossSectionStateOf(
		panel: RenderedPanel,
	): NavigationState | undefined {
		const candidate = panel as RenderedPanel & {
			inputEventMap?: unknown;
			navigationState?: NavigationState;
		};
		return candidate.inputEventMap === this.viewer.inputEventBindings.sliceView
			? candidate.navigationState
			: undefined;
	}

	/**
	 * Name the dimensions running across and up the panel, in that order.
	 *
	 * Read off the panel's own pose rather than from the axes the layout derived
	 * it with: that mapping is relative to a base pose an unlinked layer group
	 * keeps to itself, and it says nothing about a section the user has since
	 * turned within its plane with ↻.
	 */
	private captionFor(navigationState: NavigationState): string {
		const { orientation } = navigationState.pose.orientation;
		return [kAxes[0], kAxes[1]]
			.map((viewportAxis) => {
				// The pose orientation maps viewport axes onto the displayed ones.
				const displayed = vec3.transformQuat(
					vec3.create(),
					viewportAxis,
					orientation,
				);
				let axis = 0;
				for (let i = 1; i < 3; ++i) {
					if (Math.abs(displayed[i]) > Math.abs(displayed[axis])) axis = i;
				}
				return this.displayDimensionName(axis);
			})
			.join(SEPARATOR);
	}

	/** The dataset's name for a display axis, falling back to our letter for it. */
	private displayDimensionName(axis: number): string {
		const { globalDimensionNames, displayDimensionIndices } =
			this.viewer.displayDimensionRenderInfo.value;
		const global = displayDimensionIndices[axis];
		const name = global === -1 ? undefined : globalDimensionNames[global];
		return name === undefined || name === "" ? AXIS_LETTERS[axis] : name;
	}
}
