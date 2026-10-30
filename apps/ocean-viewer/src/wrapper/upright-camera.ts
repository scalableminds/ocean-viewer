/**
 * Keeps the 3D camera north-up: meridians always run up and down the screen,
 * so the map can't end up rotated or upside down (issue #20).
 *
 * Neuroglancer's left-drag is a trackball that tumbles freely, rolling the
 * camera about its view axis. Here the 3D panel turns like a turntable on a
 * north–south spindle instead: a horizontal drag spins the camera about the
 * latitude axis, a vertical drag tilts it until it looks along that axis from
 * the north or the south.
 *
 * Every other change to the camera — a CONFIG, `r` / `e` — is levelled in the
 * same synchronous `changed` dispatch, before Neuroglancer's next frame, so it
 * never renders rolled.
 *
 * The camera is written relative to the cross-section pose `p` as
 * `p · Ry(yaw) · Rx(tilt)`, with tilt in [-π/2, π/2]. Its right-hand axis then
 * never leans along y, the pose's latitude axis, and screen-up never points
 * south. The XY / XZ / YZ align views are all of this form: tilt 0 / π/2 / 0.
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
 * Below this cosine of the tilt the view direction is too close to the
 * latitude axis to read a yaw from, so the yaw comes from the camera's
 * right-hand axis instead.
 */
const NEAR_POLE = 0.1;

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

	/** `r` / `e` roll about the view axis; in 3D they spin north-up instead. */
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
		const tilt = tiltOf(local);
		const nextTilt = clamp(
			tilt - deltaY * RADIANS_PER_PIXEL,
			-Math.PI / 2,
			Math.PI / 2,
		);
		// Tilt about the camera's own right-hand axis, which never leans north.
		const turn = quat.setAxisAngle(quat.create(), kAxes[0], nextTilt - tilt);
		quat.multiply(
			pose.orientation.orientation,
			pose.orientation.orientation,
			turn,
		);
		this.spin(pose, deltaX * RADIANS_PER_PIXEL);
	}

	/** Turn the camera about the latitude axis, which keeps it north-up. */
	private spin(pose: DisplayPose, angle: number): void {
		const latitude = vec3.transformQuat(
			vec3.create(),
			kAxes[1],
			this.viewer.navigationState.pose.orientation.orientation,
		);
		const turn = quat.setAxisAngle(quat.create(), latitude, angle);
		const { orientation } = pose.orientation;
		quat.multiply(orientation, turn, orientation);
		pose.orientation.changed.dispatch();
	}

	/**
	 * Replace a rolled camera with the north-up one closest to it: same view
	 * direction, unless that is near the latitude axis, in which case the same
	 * right-hand axis.
	 * Re-entered by its own dispatch, which then finds nothing to do.
	 */
	private readonly level = (): void => {
		const camera = this.viewer.projectionOrientation;
		const local = this.localCamera(camera.orientation);
		const view = axisOf(local, 2);
		const right = axisOf(local, 0);
		const tilt = tiltOf(local);
		// The canonical view direction is Ry(yaw) · (0, -sin tilt, cos tilt), i.e.
		// (cos tilt · sin yaw, -sin tilt, cos tilt · cos yaw), and its right-hand
		// axis Ry(yaw) · (1, 0, 0) = (cos yaw, 0, -sin yaw).
		const yaw =
			Math.cos(tilt) > NEAR_POLE
				? Math.atan2(view[0], view[2])
				: Math.atan2(-right[2], right[0]);
		const level = quat.setAxisAngle(quat.create(), kAxes[1], yaw);
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

	/** The camera relative to the cross-section pose, whose y is latitude. */
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

/** How far a canonical camera looks along latitude: positive towards north. */
function tiltOf(local: quat): number {
	return Math.asin(clamp(-axisOf(local, 2)[1], -1, 1));
}

/** Where `orientation` sends the unit vector along `axis`. */
function axisOf(orientation: quat, axis: number): vec3 {
	return vec3.transformQuat(vec3.create(), kAxes[axis], orientation);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
