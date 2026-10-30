/**
 * Stops the orthographic 3D view from clipping whatever sits close to the viewer.
 *
 * Neuroglancer floors the near plane at 0.1 in both projections, with the camera
 * one unit (half the panel height) in front of the centre. That suits
 * perspective, but in orthographic it cuts away anything more than 0.9 panel
 * half-heights in front of the centre, so zooming in on deep content (meshes,
 * the full water column) slices off its front. An orthographic near plane may
 * sit behind the camera, so give it the same reach in front as the far plane
 * has behind: `1 ± relativeDepthRange`.
 */

import type { PerspectivePanel } from "neuroglancer/unstable/perspective_view/panel.js";
import { updateProjectionParametersFromInverseViewAndProjection } from "neuroglancer/unstable/projection_parameters.js";
import type { WatchableValueInterface } from "neuroglancer/unstable/trackable_value.js";

export function widenOrthographicDepth(
	panel: PerspectivePanel,
	orthographicProjection: WatchableValueInterface<boolean>,
): void {
	// Runs after Neuroglancer's own listeners, and before the worker's debounced
	// copy is taken, so chunk selection sees the widened frustum too.
	panel.registerDisposer(
		panel.projectionParameters.changed.add((_old, parameters) => {
			if (!orthographicProjection.value) return;
			const { relativeDepthRange } = panel.navigationState;
			const near = 1 - relativeDepthRange;
			const far = 1 + relativeDepthRange;
			// Only the z row of `mat4.ortho` depends on near/far, and the viewport
			// adjustment leaves it alone, so patch it in place.
			const { projectionMat } = parameters;
			projectionMat[10] = 2 / (near - far);
			projectionMat[14] = (far + near) / (near - far);
			updateProjectionParametersFromInverseViewAndProjection(parameters);
		}),
	);
}
