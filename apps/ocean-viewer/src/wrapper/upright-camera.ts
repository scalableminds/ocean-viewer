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
 * `r` / `e` spin the same way. The two-finger twist, which would roll, is
 * unbound in `input-bindings.ts`.
 *
 * The camera's state is a yaw and a tilt relative to the cross-section pose
 * `p`: the camera is always `p · Ry(yaw) · Rx(tilt)`, with tilt in [-π/2, π/2].
 * Its right-hand axis then never leans along y, the pose's latitude axis, and
 * screen-up never points south. The XY / XZ / YZ align views are all of this
 * form: tilt 0 / π/2 / 0.
 *
 * When the pose turns (↺ / ↻, a CONFIG), the camera is re-derived from that
 * yaw and tilt, so it turns with the data. Only a write to the camera from
 * elsewhere (a CONFIG, the align buttons) is read back into yaw and tilt,
 * levelled if it was rolled. Both happen in the same synchronous `changed`
 * dispatch, before Neuroglancer's next frame, so a rolled camera never renders.
 */

import type { RenderedDataPanel } from "neuroglancer/unstable/rendered_data_panel.js";
import { kAxes, quat, vec3 } from "neuroglancer/unstable/util/geom.js";
import { startRelativeMouseDrag } from "neuroglancer/unstable/util/mouse_drag.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";
import { isPerspectivePanel, relativeToPose } from "./panels.js";

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

/** Slack for float32 round-off before a camera counts as changed. */
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

	/** The camera relative to the cross-section pose; see the module doc. */
	private yaw = 0;
	private tilt = 0;

	constructor(private readonly viewer: Viewer) {
		// Capture, so this runs before the listener the 3D panel puts on itself.
		for (const [type, listener] of this.listeners) {
			viewer.element.addEventListener(type, listener, true);
		}
		viewer.projectionOrientation.changed.add(this.onCameraChanged);
		viewer.navigationState.pose.orientation.changed.add(this.follow);
		this.onCameraChanged();
	}

	dispose(): void {
		for (const [type, listener] of this.listeners) {
			this.viewer.element.removeEventListener(type, listener, true);
		}
		this.viewer.projectionOrientation.changed.remove(this.onCameraChanged);
		this.viewer.navigationState.pose.orientation.changed.remove(this.follow);
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
		this.yaw += sign * KEY_STEP;
		this.follow();
	}

	/**
	 * A drag: spin about the latitude axis, tilt about the camera's own
	 * right-hand axis — together, a step in yaw and tilt.
	 */
	private turn(panel: RenderedDataPanel, deltaX: number, deltaY: number): void {
		panel.context.flagContinuousCameraMotion();
		this.yaw += deltaX * RADIANS_PER_PIXEL;
		this.tilt = clamp(
			this.tilt - deltaY * RADIANS_PER_PIXEL,
			-Math.PI / 2,
			Math.PI / 2,
		);
		this.follow();
	}

	/**
	 * A camera written from outside: adopt its yaw and tilt, and level it if it
	 * was rolled. Our own writes already match and fall through.
	 */
	private readonly onCameraChanged = (): void => {
		if (this.matches()) return;
		({ yaw: this.yaw, tilt: this.tilt } = this.yawTiltOf(
			this.viewer.projectionOrientation,
		));
		this.follow();
	};

	/**
	 * Write the camera for the current yaw, tilt and pose. Re-entered through
	 * `onCameraChanged` by its own dispatch, which then finds nothing to do.
	 */
	private readonly follow = (): void => {
		if (this.matches()) return;
		const camera = this.viewer.projectionOrientation;
		quat.copy(camera.orientation, scratchQuat);
		camera.changed.dispatch();
	};

	/** Whether the camera is already the one for yaw and tilt, left in scratch. */
	private matches(): boolean {
		this.canonical(this.yaw, this.tilt, scratchQuat);
		const { orientation } = this.viewer.projectionOrientation;
		// `q` and `-q` are the same turn.
		return Math.abs(quat.dot(scratchQuat, orientation)) > 1 - QUAT_EPSILON;
	}

	/**
	 * The yaw and tilt of the north-up camera closest to `camera`: same view
	 * direction, unless that is near the latitude axis, in which case the same
	 * right-hand axis. Exact for a camera that is already north-up.
	 */
	private yawTiltOf(camera: { orientation: quat }): {
		yaw: number;
		tilt: number;
	} {
		relativeToPose(this.viewer, camera.orientation, scratchQuat);
		const view = vec3.transformQuat(scratchView, kAxes[2], scratchQuat);
		// atan2, not asin, which loses precision near the poles.
		const tilt = Math.atan2(-view[1], Math.hypot(view[0], view[2]));
		// The canonical view direction is Ry(yaw) · (0, -sin tilt, cos tilt), i.e.
		// (cos tilt · sin yaw, -sin tilt, cos tilt · cos yaw), and its right-hand
		// axis Ry(yaw) · (1, 0, 0) = (cos yaw, 0, -sin yaw).
		if (Math.cos(tilt) > NEAR_POLE) {
			return { yaw: Math.atan2(view[0], view[2]), tilt };
		}
		const right = vec3.transformQuat(scratchRight, kAxes[0], scratchQuat);
		return { yaw: Math.atan2(-right[2], right[0]), tilt };
	}

	/** Write `p · Ry(yaw) · Rx(tilt)` into `out`. */
	private canonical(yaw: number, tilt: number, out: quat): quat {
		quat.setAxisAngle(out, kAxes[1], yaw);
		quat.rotateX(out, out, tilt);
		return quat.multiply(
			out,
			this.viewer.navigationState.pose.orientation.orientation,
			out,
		);
	}

	/** The 3D panel an action fired in, or undefined for a cross-section. */
	private perspectivePanelOf(event: Event): RenderedDataPanel | undefined {
		const target = event.target as Node;
		for (const panel of this.viewer.display.panels) {
			if (
				isPerspectivePanel(this.viewer, panel) &&
				panel.element.contains(target)
			) {
				return panel;
			}
		}
		return undefined;
	}
}

/** Scratch for the listeners, which run on every camera and pose change. */
const scratchQuat = quat.create();
const scratchView = vec3.create();
const scratchRight = vec3.create();

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
