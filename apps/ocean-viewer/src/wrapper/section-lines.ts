/**
 * Draws, in each cross-section panel, a line where every *other* cross-section
 * on screen cuts it — in that section's colour, the same one its caption and
 * its outline in the 3D panel carry.
 *
 * Neuroglancer's own axis lines (`showAxisLines`, turned off in `viewer.ts`)
 * show the data axes from the centre, so once ↻ turns the data they point
 * along the data, not along the planes the other panels show. The planes all
 * hang off one shared pose, so in practice each cut runs straight across or up
 * the panel through its centre — but the line is computed from the two
 * sections' matrices, so it stays right for any pose a layout hands out.
 *
 * Drawn as an SVG overlay, as in `section-outlines.ts`, and only for sections
 * actually in the layout: a line for a section not on screen would point at
 * nothing, so a lone or fullscreen panel carries none.
 */

import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { ProjectionParameters } from "neuroglancer/unstable/projection_parameters.js";
import type { WatchableValueInterface } from "neuroglancer/unstable/trackable_value.js";
import { vec3, vec4 } from "neuroglancer/unstable/util/geom.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";
import { sectionColor } from "./viewport-labels.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const OVERLAY_CLASS = "ocean-section-lines";

/** Sections closer to parallel than this share no line worth drawing. */
const PARALLEL_EPSILON = 1e-6;

/** The part of a Neuroglancer `SliceViewPanel` this module needs. */
interface CrossSectionPanel extends RenderedPanel {
	sliceView: {
		valid: boolean;
		projectionParameters: WatchableValueInterface<ProjectionParameters>;
	};
}

/** A cut through a panel, as a segment in its pixels and the cutting section's colour. */
interface Cut {
	from: [number, number];
	to: [number, number];
	color: string;
}

/** A column of a mat4, as the three world components this module works in. */
function columnOf(matrix: Float32Array, column: number): vec3 {
	return vec3.fromValues(
		matrix[column * 4],
		matrix[column * 4 + 1],
		matrix[column * 4 + 2],
	);
}

/** A section's plane in world coordinates. */
function planeOf(panel: CrossSectionPanel): { normal: vec3; position: vec3 } {
	const { invViewMatrix } = panel.sliceView.projectionParameters.value;
	return {
		normal: vec3.normalize(vec3.create(), columnOf(invViewMatrix, 2)),
		position: columnOf(invViewMatrix, 3),
	};
}

/** The display axis a plane cuts along: its normal's largest component. */
function normalAxisOf(normal: vec3): number {
	let axis = 0;
	for (let i = 1; i < 3; ++i) {
		if (Math.abs(normal[i]) > Math.abs(normal[axis])) axis = i;
	}
	return axis;
}

export class SectionLines {
	private readonly observer: MutationObserver;
	private readonly overlays = new Map<CrossSectionPanel, SVGSVGElement>();

	/**
	 * Reconciled from DOM mutations and redrawn on `updateFinished`, for the same
	 * reasons as `section-outlines.ts`: panels come and go with the layout, and
	 * the lines follow every pose and position change.
	 */
	constructor(private readonly viewer: Viewer) {
		this.observer = new MutationObserver(this.apply);
		this.observer.observe(viewer.element, { childList: true, subtree: true });
		viewer.display.updateFinished.add(this.draw);
		this.apply();
	}

	dispose(): void {
		this.observer.disconnect();
		this.viewer.display.updateFinished.remove(this.draw);
		for (const [panel, overlay] of this.overlays) {
			overlay.remove();
			this.overlays.delete(panel);
		}
	}

	/** Ensure every cross-section panel — and only those — carries one overlay. */
	private readonly apply = (): void => {
		const panels = this.viewer.display.panels;
		for (const [panel, overlay] of this.overlays) {
			if (!panels.has(panel)) {
				overlay.remove();
				this.overlays.delete(panel);
			}
		}
		for (const panel of panels) {
			if (!this.isCrossSectionPanel(panel) || this.overlays.has(panel)) {
				continue;
			}
			const overlay = document.createElementNS(SVG_NS, "svg");
			overlay.setAttribute("class", OVERLAY_CLASS);
			panel.element.appendChild(overlay);
			this.overlays.set(panel, overlay);
		}
		this.draw();
	};

	private readonly draw = (): void => {
		for (const [panel, overlay] of this.overlays) {
			this.drawPanel(panel, overlay);
		}
	};

	/** Re-lay the lines one cross-section panel shows for its neighbours. */
	private drawPanel(panel: CrossSectionPanel, overlay: SVGSVGElement): void {
		const { width, height } = panel.element.getBoundingClientRect();
		overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);

		const lines: Cut[] = [];
		if (panel.sliceView.valid) {
			for (const other of this.overlays.keys()) {
				if (other === panel || !other.sliceView.valid) continue;
				const line = this.cutOf(panel, other, width, height);
				if (line !== undefined) lines.push(line);
			}
		}

		lines.forEach(({ from, to, color }, index) => {
			const element =
				overlay.children[index] instanceof SVGLineElement
					? (overlay.children[index] as SVGLineElement)
					: overlay.appendChild(document.createElementNS(SVG_NS, "line"));
			element.setAttribute("x1", String(from[0]));
			element.setAttribute("y1", String(from[1]));
			element.setAttribute("x2", String(to[0]));
			element.setAttribute("y2", String(to[1]));
			element.setAttribute("stroke", color);
		});
		while (overlay.children.length > lines.length) {
			overlay.lastElementChild?.remove();
		}
	}

	/**
	 * Where `other`'s plane crosses `panel`'s, as a segment in panel pixels long
	 * enough to span the panel (the overlay clips it) — or undefined when the two
	 * are parallel.
	 */
	private cutOf(
		panel: CrossSectionPanel,
		other: CrossSectionPanel,
		width: number,
		height: number,
	): Cut | undefined {
		const own = planeOf(panel);
		const cut = planeOf(other);
		const direction = vec3.cross(vec3.create(), own.normal, cut.normal);
		if (vec3.length(direction) < PARALLEL_EPSILON) return undefined;
		vec3.normalize(direction, direction);

		// A point on both planes: walk from this panel's centre, within its plane
		// and across the cut, until reaching the other plane. Zero steps when the
		// two share a position, as linked panels do.
		const across = vec3.cross(vec3.create(), direction, own.normal);
		const offset = vec3.sub(vec3.create(), cut.position, own.position);
		const anchor = vec3.scaleAndAdd(
			vec3.create(),
			own.position,
			across,
			vec3.dot(cut.normal, offset) / vec3.dot(cut.normal, across),
		);

		const { viewProjectionMat } = panel.sliceView.projectionParameters.value;
		const toPixels = (point: vec3): [number, number] => {
			const clip = vec4.transformMat4(
				vec4.create(),
				vec4.fromValues(point[0], point[1], point[2], 1),
				viewProjectionMat,
			);
			return [
				((clip[0] / clip[3] + 1) / 2) * width,
				((1 - clip[1] / clip[3]) / 2) * height,
			];
		};
		const start = toPixels(anchor);
		const ahead = toPixels(vec3.add(vec3.create(), anchor, direction));
		const dx = ahead[0] - start[0];
		const dy = ahead[1] - start[1];
		const length = Math.hypot(dx, dy);
		// A panel mid-rebuild has no projection yet, and maps everything to NaN.
		if (!(Number.isFinite(length) && length > 0)) return undefined;
		// Out past the far corner either way, whatever the anchor's place.
		const reach = (width + height + Math.hypot(...start)) / length;
		return {
			from: [start[0] - dx * reach, start[1] - dy * reach],
			to: [start[0] + dx * reach, start[1] + dy * reach],
			color: sectionColor(normalAxisOf(cut.normal)),
		};
	}

	/**
	 * Identify a cross-section by the input bindings it was wired with, as in
	 * `viewport-labels.ts`.
	 */
	private isCrossSectionPanel(
		panel: RenderedPanel,
	): panel is CrossSectionPanel {
		return (
			(panel as RenderedPanel & { inputEventMap?: unknown }).inputEventMap ===
			this.viewer.inputEventBindings.sliceView
		);
	}
}
