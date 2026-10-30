/**
 * Keeps the 3D camera upright: the ocean surface stays level on screen, so the
 * world can't end up upside down (issue #20).
 *
 * Neuroglancer's left-drag is a trackball that tumbles freely, rolling the
 * camera about its view axis. Here the 3D panel turns like a turntable
 * instead: a horizontal drag spins the camera about the vertical (depth) axis,
 * a vertical drag tilts it between looking straight down and straight up.
 *
 * Every other change to the camera — a CONFIG, `r` / `e`, the align buttons —
 * is levelled in the same synchronous `changed` dispatch, before Neuroglancer's
 * next frame, so it never renders rolled.
 *
 * The camera is written relative to the cross-section pose `p` as
 * `p · Rz(yaw) · Rx(tilt)`, with tilt in [0, π]: 0 is the top-down XY view,
 * π / 2 the upright XZ view. Its right-hand axis then always lies in the XY
 * plane, i.e. it has no roll. Depth runs along the pose's z axis, which is
 * also screen-up in the XZ section.
 */

import type { RenderedPanel } from "neuroglancer/unstable/display_context.js";
import type { DisplayPose } from "neuroglancer/unstable/navigation_state.js";
import type { RenderedDataPanel } from "neuroglancer/unstable/rendered_data_panel.js";
import { kAxes, quat, vec3 } from "neuroglancer/unstable/util/geom.js";
import { startRelativeMouseDrag } from "neuroglancer/unstable/util/mouse_drag.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

/** Drag sensitivity, matching Neuroglancer's own: ¼° per pixel. */
const RADIANS_PER_PIXEL = Math.PI / 180 / 4;

/** Turn per `r` / `e`, matching Neuroglancer's `rotate-relative-*` step. */
const KEY_STEP = 0.1;

/**
 * Below this sine of the tilt the view direction is too close to vertical to
 * read a yaw from, so the yaw comes from the camera's right-hand axis instead.
 */
const NEAR_VERTICAL = 0.1;

/** Slack for float32 round-off before levelling counts as a change. */
const QUAT_EPSILON = 1e-6;

interface TouchTranslateDetail {
	deltaX: number;
	deltaY: number;
}

export class UprightCamera {
	private readonly listeners: Array<[string, (event: Event) => void]> = [
		["action:rotate-via-mouse-drag", (e) => this.onMouseDrag(e)],
		["action:rotate-out-of-plane-via-touchtranslate", (e) => this.onTouch(e)],
		["action:rotate-relative-z-", (e) => this.onKey(e, -1)],
		["action:rotate-relative-z+", (e) => this.onKey(e, 1)],
	];

	constructor(private readonly viewer: Viewer) {
		// Capture, so this runs before the listener the 3D panel puts on itself.
		for (const [type, listener] of this.listeners) {
			viewer.element.addEventListener(type, listener, true);
		}
		viewer.projectionOrientation.changed.add(this.level);
		viewer.navigationState.pose.orientation.changed.add(this.level);
		this.level();
	}

	dispose(): void {
		for (const [type, listener] of this.listeners) {
			this.viewer.element.removeEventListener(type, listener, true);
		}
		this.viewer.projectionOrientation.changed.remove(this.level);
		this.viewer.navigationState.pose.orientation.changed.remove(this.level);
	}

	private onMouseDrag(event: Event): void {
		const panel = this.perspectivePanelOf(event);
		if (panel === undefined) return;
		event.stopPropagation();
		startRelativeMouseDrag(
			(event as CustomEvent<MouseEvent>).detail,
			(_event, deltaX, deltaY) => this.turn(panel, deltaX, deltaY),
		);
	}

	private onTouch(event: Event): void {
		const panel = this.perspectivePanelOf(event);
		if (panel === undefined) return;
		event.stopPropagation();
		const { deltaX, deltaY } = (event as CustomEvent<TouchTranslateDetail>)
			.detail;
		this.turn(panel, deltaX, deltaY);
	}

	/** `r` / `e` roll about the view axis; in 3D they spin about depth instead. */
	private onKey(event: Event, sign: number): void {
		const panel = this.perspectivePanelOf(event);
		if (panel === undefined) return;
		event.stopPropagation();
		panel.context.flagContinuousCameraMotion();
		this.spin(panel.navigationState.pose, sign * KEY_STEP);
	}

	private turn(panel: RenderedDataPanel, deltaX: number, deltaY: number): void {
		panel.context.flagContinuousCameraMotion();
		const { pose } = panel.navigationState;
		const local = this.localCamera(pose.orientation.orientation);
		const tilt = Math.acos(clamp(axisOf(local, 2)[2], -1, 1));
		const nextTilt = clamp(tilt - deltaY * RADIANS_PER_PIXEL, 0, Math.PI);
		// Tilt about the camera's own right-hand axis, which is level.
		const turn = quat.setAxisAngle(quat.create(), kAxes[0], nextTilt - tilt);
		quat.multiply(
			pose.orientation.orientation,
			pose.orientation.orientation,
			turn,
		);
		this.spin(pose, deltaX * RADIANS_PER_PIXEL);
	}

	/** Turn the camera about the depth axis, which keeps it level. */
	private spin(pose: DisplayPose, angle: number): void {
		const depth = vec3.transformQuat(
			vec3.create(),
			kAxes[2],
			this.viewer.navigationState.pose.orientation.orientation,
		);
		const turn = quat.setAxisAngle(quat.create(), depth, angle);
		const { orientation } = pose.orientation;
		quat.multiply(orientation, turn, orientation);
		pose.orientation.changed.dispatch();
	}

	/**
	 * Replace a rolled camera with the level one closest to it: same view
	 * direction, unless that is near vertical, in which case same heading.
	 * Re-entered by its own dispatch, which then finds nothing to do.
	 */
	private readonly level = (): void => {
		const camera = this.viewer.projectionOrientation;
		const local = this.localCamera(camera.orientation);
		const view = axisOf(local, 2);
		const right = axisOf(local, 0);
		const tilt = Math.acos(clamp(view[2], -1, 1));
		// The canonical view direction is Rz(yaw) · (0, -sin tilt, cos tilt) and
		// its right-hand axis Rz(yaw) · (1, 0, 0).
		const yaw =
			Math.sin(tilt) > NEAR_VERTICAL
				? Math.atan2(view[0], -view[1])
				: Math.atan2(right[1], right[0]);
		const level = quat.setAxisAngle(quat.create(), kAxes[2], yaw);
		quat.rotateX(level, level, tilt);
		quat.multiply(
			level,
			this.viewer.navigationState.pose.orientation.orientation,
			level,
		);
		// `q` and `-q` are the same turn.
		if (Math.abs(quat.dot(level, camera.orientation)) > 1 - QUAT_EPSILON)
			return;
		quat.copy(camera.orientation, level);
		camera.changed.dispatch();
	};

	/** The camera relative to the cross-section pose, whose z is depth. */
	private localCamera(orientation: quat): quat {
		const pose = this.viewer.navigationState.pose.orientation.orientation;
		return quat.multiply(
			quat.create(),
			quat.invert(quat.create(), pose),
			orientation,
		);
	}

	/**
	 * The 3D panel an action fired in, or undefined for a cross-section — told
	 * apart by its event map, as in `viewport-controls.ts`.
	 */
	private perspectivePanelOf(event: Event): RenderedDataPanel | undefined {
		const target = event.target as Node;
		for (const panel of this.viewer.display.panels) {
			if (
				(panel as RenderedPanel & { inputEventMap?: unknown }).inputEventMap ===
					this.viewer.inputEventBindings.perspectiveView &&
				panel.element.contains(target)
			) {
				return panel as RenderedDataPanel;
			}
		}
		return undefined;
	}
}

/** Where `orientation` sends the unit vector along `axis`. */
function axisOf(orientation: quat, axis: number): vec3 {
	return vec3.transformQuat(vec3.create(), kAxes[axis], orientation);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
