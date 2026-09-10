/**
 * Outlines each cross-section where it sits in the 3D panel, in the colour of
 * the axis it cuts along — the same colour `viewport-labels.ts` tints that
 * section's caption with.
 *
 * Neuroglancer draws the sections in 3D as textured quads, and with
 * `hideCrossSectionBackground3D` on, everything but the data itself is
 * transparent: a section over empty water leaves nothing on screen to say where
 * its plane lies. Its own dataset-bounds box would say something, but only one
 * box for the whole cube, in one colour — hence a box per section, drawn where
 * that section cuts the dataset bounds and moving with it as the user scrolls
 * through the third dimension.
 *
 * Drawn as an SVG overlay rather than as a render layer: Neuroglancer's world
 * coordinates for a display axis are that dimension's own voxel coordinates
 * (`DisplayPose.toMat4`), so the bounds of the coordinate space are already
 * expressed in the space the 3D panel projects from — a few lines of matrix
 * maths against public state, where a WebGL layer would mean shaders and a
 * picking pass. The overlay is clipped to its panel, and the outlines are
 * ordered back to front among themselves, but they still sit on top of the
 * rendered data rather than depth-sorted into it — an outline whose plane is
 * behind the data is drawn, not hidden.
 */

import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { ProjectionParameters } from "neuroglancer/unstable/projection_parameters.js";
import type { WatchableValueInterface } from "neuroglancer/unstable/trackable_value.js";
import { vec3, vec4 } from "neuroglancer/unstable/util/geom.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";
import { PLANE_COLORS } from "./viewport-labels.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const OVERLAY_CLASS = "ocean-section-outlines";

/** Thin enough not to hide the data it borders, thick enough to read as a box. */
const STROKE_WIDTH = 1.5;

/** The corners of a section rectangle, as signs on its two in-plane axes. */
const CORNERS: ReadonlyArray<readonly [number, number]> = [
	[-1, -1],
	[1, -1],
	[1, 1],
	[-1, 1],
];

/**
 * The part of a Neuroglancer slice view this module needs: the matrices that
 * place its quad in the world. Structural, since `SliceView` is only reachable
 * through the 3D panel's own private-ish `sliceViews` map.
 */
interface SectionView {
	valid: boolean;
	projectionParameters: WatchableValueInterface<ProjectionParameters>;
}

/** The dataset bounds over the three display axes, in world coordinates. */
interface DisplayBounds {
	center: vec3;
	halfSize: vec3;
}

/** A column of a mat4, as the three world components this module works in. */
function columnOf(
	matrix: Float32Array,
	column: number,
): [number, number, number] {
	return [matrix[column * 4], matrix[column * 4 + 1], matrix[column * 4 + 2]];
}

/** The 3D panel, as far as its sections are concerned. */
interface PerspectivePanelLike extends RenderedPanel {
	projectionParameters: WatchableValueInterface<ProjectionParameters>;
	sliceViews: Map<SectionView, boolean>;
	/**
	 * The panel's slice-view toggle. Read from the panel rather than from the
	 * viewer, since a layout builds each 3D panel with its own: `4panel` shares
	 * the viewer's, a lone `3d` panel gets one that is permanently off.
	 */
	viewer: { showSliceViews: { value: boolean } };
}

export class SectionOutlines {
	private readonly observer: MutationObserver;
	private readonly overlays = new Map<RenderedPanel, SVGSVGElement>();

	/**
	 * The overlay is reconciled from DOM mutations, as in `viewport-labels.ts`:
	 * panels are built after bootstrap and rebuilt wholesale on a layout change.
	 *
	 * Redrawing is driven off `updateFinished` instead — the geometry follows the
	 * 3D camera and the position of every section, and that signal fires once per
	 * frame in which any of them moved, which is exactly when the outlines are
	 * stale. Recomputing three rectangles is far cheaper than subscribing to each
	 * of those states and reasoning about which ones have settled.
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

	/** Ensure every 3D panel — and only those — carries one overlay. */
	private readonly apply = (): void => {
		const panels = this.viewer.display.panels;
		for (const [panel, overlay] of this.overlays) {
			if (!panels.has(panel)) {
				overlay.remove();
				this.overlays.delete(panel);
			}
		}
		for (const panel of panels) {
			if (!this.isPerspectivePanel(panel) || this.overlays.has(panel)) continue;
			const overlay = document.createElementNS(SVG_NS, "svg");
			overlay.setAttribute("class", OVERLAY_CLASS);
			panel.element.appendChild(overlay);
			this.overlays.set(panel, overlay);
		}
		this.draw();
	};

	private readonly draw = (): void => {
		for (const [panel, overlay] of this.overlays) {
			this.drawPanel(panel as PerspectivePanelLike, overlay);
		}
	};

	/** Re-lay the rectangles of one 3D panel's sections. */
	private drawPanel(panel: PerspectivePanelLike, overlay: SVGSVGElement): void {
		const { width, height } = panel.element.getBoundingClientRect();
		const { viewMatrix, viewProjectionMat } = panel.projectionParameters.value;
		// A viewBox in CSS pixels keeps the stroke width honest at any DPR.
		overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);

		const rectangles: Array<{
			points: Array<[number, number]>;
			color: string;
			depth: number;
		}> = [];
		const bounds = this.displayBounds();
		const showSliceViews = panel.viewer.showSliceViews.value;
		for (const [section, unconditional] of panel.sliceViews) {
			// Mirror the condition Neuroglancer draws the quad itself under, so an
			// outline never floats without its section.
			if (bounds === undefined) break;
			if (!(unconditional || showSliceViews) || !section.valid) continue;
			const rectangle = this.cornersOf(
				section,
				bounds,
				viewProjectionMat,
				width,
				height,
			);
			if (rectangle === undefined) continue;
			const inView = vec3.transformMat4(
				vec3.create(),
				rectangle.center,
				viewMatrix,
			);
			rectangles.push({
				points: rectangle.points,
				color: PLANE_COLORS[this.normalAxisOf(section)],
				// The camera looks down its own -z, so distance in front of it is -z.
				depth: -inView[2],
			});
		}
		// Painter's algorithm, as far as stroked outlines take it: the section
		// nearest the camera is drawn last, so at a crossing the near one wins.
		rectangles.sort((a, b) => b.depth - a.depth);

		rectangles.forEach(({ points, color }, index) => {
			const polygon =
				overlay.children[index] instanceof SVGPolygonElement
					? (overlay.children[index] as SVGPolygonElement)
					: overlay.appendChild(document.createElementNS(SVG_NS, "polygon"));
			polygon.setAttribute(
				"points",
				points.map(([x, y]) => `${x},${y}`).join(" "),
			);
			polygon.setAttribute("fill", "none");
			polygon.setAttribute("stroke", color);
			polygon.setAttribute("stroke-width", String(STROKE_WIDTH));
		});
		// Sections come and go with the layout; drop the rectangles left over.
		while (overlay.children.length > rectangles.length) {
			overlay.lastElementChild?.remove();
		}
	}

	/**
	 * Where the section cuts the dataset bounds, as four corners in panel pixels
	 * — or undefined when a corner falls behind the camera, since a perspective
	 * projection turns those inside out and a rectangle with one bogus corner is
	 * worse than none.
	 *
	 * The rectangle is built in the section's own plane rather than from the two
	 * bounding-box faces it runs between: a section the user has turned with ↻ is
	 * not axis-aligned, and there the rectangle grows to the bounding box's
	 * silhouette along each in-plane direction — never degenerate, and exactly
	 * the data bounds again as soon as the pose is square.
	 */
	private cornersOf(
		section: SectionView,
		bounds: DisplayBounds,
		viewProjectionMat: Float32Array,
		panelWidth: number,
		panelHeight: number,
	): { points: Array<[number, number]>; center: vec3 } | undefined {
		const { invViewMatrix } = section.projectionParameters.value;
		// Columns of the section's inverse view matrix: its two in-plane
		// directions, its normal, and the position it is parked at. The first three
		// carry the zoom as well, hence the normalisation.
		const inPlane = [
			vec3.normalize(
				vec3.create(),
				vec3.fromValues(...columnOf(invViewMatrix, 0)),
			),
			vec3.normalize(
				vec3.create(),
				vec3.fromValues(...columnOf(invViewMatrix, 1)),
			),
		];
		const normal = vec3.normalize(
			vec3.create(),
			vec3.fromValues(...columnOf(invViewMatrix, 2)),
		);
		const position = vec3.fromValues(...columnOf(invViewMatrix, 3));

		// Slide the centre of the bounds onto the section's plane, so the rectangle
		// tracks the third dimension as the user scrolls through it.
		const center = vec3.scaleAndAdd(
			vec3.create(),
			bounds.center,
			normal,
			-vec3.dot(vec3.sub(vec3.create(), bounds.center, position), normal),
		);
		// Half-extent of the bounds along an in-plane direction: its support
		// function, which for an axis-aligned direction picks out that axis alone.
		const halfExtents = inPlane.map((direction) => {
			let extent = 0;
			for (let axis = 0; axis < 3; ++axis) {
				extent += Math.abs(direction[axis]) * bounds.halfSize[axis];
			}
			return extent;
		});

		const points: Array<[number, number]> = [];
		for (const [u, v] of CORNERS) {
			const corner = vec3.clone(center);
			vec3.scaleAndAdd(corner, corner, inPlane[0], u * halfExtents[0]);
			vec3.scaleAndAdd(corner, corner, inPlane[1], v * halfExtents[1]);
			const clip = vec4.transformMat4(
				vec4.create(),
				vec4.fromValues(corner[0], corner[1], corner[2], 1),
				viewProjectionMat,
			);
			if (clip[3] <= 0) return undefined;
			points.push([
				((clip[0] / clip[3] + 1) / 2) * panelWidth,
				((1 - clip[1] / clip[3]) / 2) * panelHeight,
			]);
		}
		return { points, center };
	}

	/**
	 * The dataset bounds in the coordinates the 3D panel projects from: the
	 * global coordinate space's own voxel bounds, taken per display axis and
	 * reduced to a centre and half-size.
	 *
	 * Undefined until there is something to bound — a coordinate space with fewer
	 * than three display dimensions, or one whose bounds are still unknown (a
	 * layer that hasn't loaded leaves them infinite).
	 */
	private displayBounds(): DisplayBounds | undefined {
		const { displayDimensionIndices } =
			this.viewer.displayDimensionRenderInfo.value;
		const { lowerBounds, upperBounds } =
			this.viewer.navigationState.coordinateSpace.value.bounds;
		const center = vec3.create();
		const halfSize = vec3.create();
		for (let i = 0; i < 3; ++i) {
			const dim = displayDimensionIndices[i];
			if (dim === -1) return undefined;
			const lower = lowerBounds[dim];
			const upper = upperBounds[dim];
			if (
				!(Number.isFinite(lower) && Number.isFinite(upper) && upper > lower)
			) {
				return undefined;
			}
			center[i] = (lower + upper) / 2;
			halfSize[i] = (upper - lower) / 2;
		}
		return { center, halfSize };
	}

	/**
	 * The display axis a section cuts along, read off the third column of its
	 * inverse view matrix — the world direction its viewport's z axis points,
	 * i.e. the plane's normal. Equivalent to the axes `viewport-labels.ts` reads
	 * from the pose, so the caption and the outline agree on the colour.
	 */
	private normalAxisOf(section: SectionView): number {
		const { invViewMatrix } = section.projectionParameters.value;
		let axis = 0;
		for (let i = 1; i < 3; ++i) {
			if (Math.abs(invViewMatrix[8 + i]) > Math.abs(invViewMatrix[8 + axis])) {
				axis = i;
			}
		}
		return axis;
	}

	/**
	 * Identify the 3D panel by the input bindings it was wired with, as in
	 * `viewport-controls.ts` — a layer group hands each panel a linked copy of
	 * its navigation state, but the event maps pass through as-is.
	 */
	private isPerspectivePanel(panel: RenderedPanel): boolean {
		return (
			(panel as RenderedPanel & { inputEventMap?: unknown }).inputEventMap ===
			this.viewer.inputEventBindings.perspectiveView
		);
	}
}
