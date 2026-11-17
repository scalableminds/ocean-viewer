/**
 * The Ocean Viewer's default `3panel` layout: the lon/lat map (XY) above the
 * lon/depth section (XZ) on the left, the 3D view filling the right column.
 *
 * Registered into Neuroglancer's own layout table, so it is selected by name
 * like any built-in. Mirrors `FourPanelAltLayout` minus the YZ section; the
 * corner controls and dimension widgets it adds are hidden by `chrome.css`, so
 * they are left out.
 *
 * The 3D panel renders with its own, undamped display scales: zoom damping
 * would otherwise stretch the 3D scene with every 2D zoom.
 */

import {
	type DataPanelLayoutContainer,
	getCommonViewerState,
	LAYOUTS,
	makeNamedSliceView,
	type ViewerUIState,
} from "neuroglancer/unstable/data_panel_layout.js";
import * as L from "neuroglancer/unstable/layout.js";
import {
	DisplayPose,
	LinkedDepthRange,
	LinkedZoomState,
	NavigationState,
	type TrackableProjectionZoom,
	WatchableDisplayDimensionRenderInfo,
} from "neuroglancer/unstable/navigation_state.js";
import { PerspectivePanel } from "neuroglancer/unstable/perspective_view/panel.js";
import { SliceViewPanel } from "neuroglancer/unstable/sliceview/panel.js";
import { RefCounted } from "neuroglancer/unstable/util/disposable.js";
import { removeChildren } from "neuroglancer/unstable/util/dom.js";
import { projectionDisplayScales } from "./display-scales.js";
import { widenOrthographicDepth } from "./orthographic-depth.js";

export const THREE_PANEL_LAYOUT = "3panel";

class ThreePanelLayout extends RefCounted {
	constructor(
		public container: DataPanelLayoutContainer,
		public rootElement: HTMLElement,
		viewer: ViewerUIState,
	) {
		super();
		const { display } = viewer;
		const sliceViewerState = {
			...getCommonViewerState(viewer),
			navigationState: viewer.navigationState,
			inputEventMap: viewer.inputEventBindings.sliceView,
			showScaleBar: viewer.showScaleBar,
		};
		const perspectiveViewerState = {
			...getCommonViewerState(viewer),
			navigationState: this.registerDisposer(
				undampedNavigationState(viewer.perspectiveNavigationState),
			),
			inputEventMap: viewer.inputEventBindings.perspectiveView,
			orthographicProjection: container.specification.orthographicProjection,
			showSliceViews: viewer.showPerspectiveSliceViews,
			showSliceViewsCheckbox: true,
			showScaleBar: viewer.showScaleBar,
			// biome-ignore lint/style/noNonNullAssertion: set once the viewer exists
			rpc: viewer.chunkManager.rpc!,
		};
		const xy = makeNamedSliceView(viewer, "xy");
		const xz = makeNamedSliceView(viewer, "xz");
		const slicePanel =
			(sliceView: typeof xy): L.Handler =>
			(element) => {
				this.registerDisposer(
					new SliceViewPanel(display, element, sliceView, sliceViewerState),
				);
			};

		L.box("row", [
			L.withFlex(
				1,
				L.box("column", [
					L.withFlex(1, slicePanel(xy)),
					L.withFlex(1, slicePanel(xz)),
				]),
			),
			L.withFlex(1, (element) => {
				const panel = this.registerDisposer(
					new PerspectivePanel(display, element, perspectiveViewerState),
				);
				widenOrthographicDepth(
					panel,
					perspectiveViewerState.orthographicProjection,
				);
				// Each section panel owns its slice view; the 3D panel borrows both.
				panel.sliceViews.set(xy.addRef(), false);
				panel.sliceViews.set(xz.addRef(), false);
			}),
		])(rootElement);
	}

	disposed() {
		removeChildren(this.rootElement);
		super.disposed();
	}
}

/**
 * A copy of the 3D navigation state on undamped display scales. Zoom and
 * depth stay linked to the original by physical size, as Neuroglancer links a
 * layer group with its own render scales; position and orientation are shared.
 *
 * Neuroglancer's world space is global voxel coordinates whatever the scales
 * (`DisplayPose.toMat4`), so the cross-sections the 3D panel borrows still land
 * on their planes — only their stretch on screen differs.
 */
function undampedNavigationState(source: NavigationState): NavigationState {
	const { pose } = source;
	const renderInfo = new WatchableDisplayDimensionRenderInfo(
		projectionDisplayScales(
			pose.relativeDisplayScales.coordinateSpace,
		).addRef(),
		pose.displayDimensions.addRef(),
	);
	const zoom = new LinkedZoomState(
		(source.zoomFactor as TrackableProjectionZoom).addRef(),
		renderInfo.addRef(),
	);
	const depth = new LinkedDepthRange(source.depthRange.addRef(), renderInfo);
	return new NavigationState(
		new DisplayPose(
			pose.position.addRef(),
			renderInfo,
			pose.orientation.addRef(),
		),
		zoom.value,
		depth.value,
	);
}

/** Call before the viewer is created, so its state can name the layout. */
export function registerThreePanelLayout(): void {
	LAYOUTS.set(THREE_PANEL_LAYOUT, {
		factory: (container, element, viewer) =>
			new ThreePanelLayout(container, element, viewer),
	});
}
