/**
 * Keeps the 3D camera elevation-up: the sea surface is always level and the
 * water column always hangs straight down the screen, so the ocean can't end
 * up rolled or upside down (issue #20).
 *
 * Neuroglancer's left-drag is a trackball that tumbles freely, rolling the
 * camera about its view axis. Here the 3D panel turns like a turntable on a
 * vertical spindle instead: a horizontal drag spins the camera about the
 * elevation axis, a vertical drag tilts it between looking straight down on
 * the map and straight up at the seafloor, through side-on views.
 *
 * `r` / `e` spin the same way. The two-finger twist, which would roll, is
 * unbound in `input-bindings.ts`.
 *
 * Near top-down, spinning would only turn the map on screen, so the map is
 * held north-up there instead: within {@link PLAN_TILT} of straight down,
 * spins are ignored and tilting further down unwinds the yaw to 0.
 *
 * World axes run east, south and down (+z is deeper), and Neuroglancer's
 * screen-down is the camera's +y. The camera's state is a yaw and a tilt
 * relative to the cross-section pose `p`: the camera is always
 * `p · Rz(yaw) · Rx(tilt)`, with tilt in [0, π]. Its right-hand axis then
 * stays level, and screen-down never points up. The XY / XZ / YZ align views
 * are all of this form: tilt 0 / π/2 / π/2, yaw 0 / 0 / π/2.
 *
 * When the pose turns (↺ / ↻, a CONFIG), the camera is re-derived from that
 * yaw and tilt, so it turns with the data. ↺ / ↻ turn about elevation, so the
 * spindle stays vertical. Only a write to the camera from elsewhere (a CONFIG,
 * the align buttons) is read back into yaw and tilt, levelled if it was
 * rolled. Both happen in the same synchronous `changed` dispatch, before
 * Neuroglancer's next frame, so a rolled camera never renders.
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
 * Below this sine of the tilt the view direction is too close to the
 * elevation axis to read a yaw from, so the yaw comes from the camera's
 * right-hand axis instead.
 */
const NEAR_VERTICAL = 0.1;

/** How far off straight down the map is still held north-up: 10°. */
const PLAN_TILT = Math.PI / 18;

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

	/** `r` / `e` roll about the view axis; in 3D they spin about elevation. */
	private onKey(event: Event, sign: number): void {
		const panel = this.perspectivePanelOf(event);
		if (panel === undefined) return;
		event.stopPropagation();
		if (this.tilt < PLAN_TILT) return;
		panel.context.flagContinuousCameraMotion();
		this.yaw += sign * KEY_STEP;
		this.follow();
	}

	/**
	 * A drag: spin about the elevation axis, tilt about the camera's own
	 * right-hand axis — together, a step in yaw and tilt. Near top-down the map
	 * is held north-up instead; see the module doc.
	 */
	private turn(panel: RenderedDataPanel, deltaX: number, deltaY: number): void {
		panel.context.flagContinuousCameraMotion();
		if (this.tilt >= PLAN_TILT) this.yaw += deltaX * RADIANS_PER_PIXEL;
		const from = Math.min(this.tilt, PLAN_TILT);
		this.tilt = clamp(this.tilt - deltaY * RADIANS_PER_PIXEL, 0, Math.PI);
		// Shrink the yaw with the tilt, so it is 0 by the time the view is
		// straight down. The shorter way round, so it never spins a full turn.
		if (this.tilt < from) {
			this.yaw = wrapAngle(this.yaw) * (this.tilt / from);
		}
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
	 * The yaw and tilt of the elevation-up camera closest to `camera`: same view
	 * direction, unless that is near vertical, in which case the same right-hand
	 * axis. Exact for a camera that is already elevation-up.
	 */
	private yawTiltOf(camera: { orientation: quat }): {
		yaw: number;
		tilt: number;
	} {
		relativeToPose(this.viewer, camera.orientation, scratchQuat);
		const view = vec3.transformQuat(scratchView, kAxes[2], scratchQuat);
		// The canonical view direction is Rz(yaw) · (0, -sin tilt, cos tilt), i.e.
		// (sin tilt · sin yaw, -sin tilt · cos yaw, cos tilt), and its right-hand
		// axis Rz(yaw) · (1, 0, 0) = (cos yaw, sin yaw, 0).
		const horizontal = Math.hypot(view[0], view[1]);
		// atan2, not acos, which loses precision near vertical.
		const tilt = Math.atan2(horizontal, view[2]);
		if (horizontal > NEAR_VERTICAL) {
			return { yaw: Math.atan2(view[0], -view[1]), tilt };
		}
		const right = vec3.transformQuat(scratchRight, kAxes[0], scratchQuat);
		return { yaw: Math.atan2(right[1], right[0]), tilt };
	}

	/** Write `p · Rz(yaw) · Rx(tilt)` into `out`. */
	private canonical(yaw: number, tilt: number, out: quat): quat {
		uprightView(yaw, tilt, out);
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

/**
 * The elevation-up camera `Rz(yaw) · Rx(tilt)` relative to the pose, written
 * into `out`. Tilt 0 looks straight down, π/2 side-on, π straight up.
 */
export function uprightView(
	yaw: number,
	tilt: number,
	out = quat.create(),
): quat {
	quat.setAxisAngle(out, kAxes[2], yaw);
	return quat.rotateX(out, out, tilt);
}

/** The default 3D view: from the south, 60° off straight down. */
export const HOME_VIEW: quat = uprightView(0, Math.PI / 3);

/**
 * Turn the 3D camera to `relative` from the XY section, so it keeps matching
 * the cross-sections after ↺ / ↻ turned the data.
 */
export function alignCamera(viewer: Viewer, relative: quat): void {
	// `orientation` is a live gl-matrix quat that nothing observes, so the
	// dispatch has to be explicit.
	const camera = viewer.projectionOrientation;
	quat.multiply(
		camera.orientation,
		viewer.navigationState.pose.orientation.orientation,
		relative,
	);
	camera.changed.dispatch();
}

/** Scratch for the listeners, which run on every camera and pose change. */
const scratchQuat = quat.create();
const scratchView = vec3.create();
const scratchRight = vec3.create();

/** `angle` in (-π, π]. */
function wrapAngle(angle: number): number {
	return angle - 2 * Math.PI * Math.ceil((angle - Math.PI) / (2 * Math.PI));
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
