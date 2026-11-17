/**
 * Display-only stretch of the world axes: `relativeDisplayScales` (static
 * vertical exaggeration) plus `oceanZoomDamping` on top of it.
 *
 *     factor = base * (zoom / anchorZoom) ** damping
 *
 * All cross-section panels share one zoom, so damping is what keeps the
 * elevation sections from lurching when the lon/lat map zooms: 0 is stock
 * Neuroglancer, 1 holds the axis still on screen. The anchor is the zoom in
 * force when a CONFIG last changed the base or damping.
 *
 * Damping only suits the cross-sections, so the 3D panel gets its own copy of
 * the factors with the base alone (`projectionDisplayScales`); see
 * `three-panel-layout.ts`.
 *
 * Factors are kept by NAME and re-applied on every coordinate-space change:
 * Neuroglancer keys them by dimension id and re-maps by id, so they fall back
 * to 1 whenever the space is re-derived from the sources' `outputDimensions`.
 */

import type { CoordinateSpace } from "neuroglancer/unstable/coordinate_transform.js";
import { TrackableRelativeDisplayScales } from "neuroglancer/unstable/navigation_state.js";
import type { WatchableValueInterface } from "neuroglancer/unstable/trackable_value.js";
import type { Viewer } from "neuroglancer/unstable/viewer.js";

/** Undamped factors for the 3D panel, one per viewer coordinate space. */
const projectionScales = new WeakMap<
	WatchableValueInterface<CoordinateSpace>,
	TrackableRelativeDisplayScales
>();

/**
 * The display scales the 3D panel renders with: the base factors without
 * damping. Created on first use, since the layout can ask before the CONFIG
 * side exists.
 */
export function projectionDisplayScales(
	coordinateSpace: WatchableValueInterface<CoordinateSpace>,
): TrackableRelativeDisplayScales {
	let scales = projectionScales.get(coordinateSpace);
	if (scales === undefined) {
		scales = new TrackableRelativeDisplayScales(coordinateSpace);
		projectionScales.set(coordinateSpace, scales);
	}
	return scales;
}

/** Sanity bounds only. */
const MIN_FACTOR = 1e-3;
const MAX_FACTOR = 1e4;

export class DisplayScales {
	private base: Record<string, number> = {};
	/** Exponents by dimension name; 0 or absent means undamped. */
	private damping: Record<string, number> = {};
	/** Zoom at which `base` holds exactly; unset until the zoom is valid. */
	private anchorZoom: number | undefined;
	private applying = false;
	private readonly projection: TrackableRelativeDisplayScales;

	constructor(private readonly viewer: Viewer) {
		this.projection = projectionDisplayScales(viewer.coordinateSpace);
		viewer.coordinateSpace.changed.add(() => {
			this.apply();
		});
		viewer.crossSectionScale.changed.add(() => {
			this.apply();
		});
	}

	/** Full CONFIG: an undefined map clears its side. */
	set(
		base: Record<string, number> | undefined,
		damping: Record<string, number> | undefined,
	): void {
		this.assign(base ?? {}, damping ?? {});
	}

	/** Partial CONFIG: keep whatever it didn't name. */
	patch(patch: {
		base?: Record<string, number>;
		damping?: Record<string, number>;
	}): void {
		this.assign(patch.base ?? this.base, patch.damping ?? this.damping);
	}

	// Re-anchors only on a real change, so a CONFIG resent verbatim (the mock
	// does this on every layer edit) keeps the damping accumulated since.
	private assign(
		base: Record<string, number>,
		damping: Record<string, number>,
	): void {
		const changed =
			!sameMap(base, this.base) || !sameMap(damping, this.damping);
		this.base = { ...base };
		this.damping = { ...damping };
		if (changed) this.anchorZoom = undefined;
		this.apply();
	}

	/** Re-assert the remembered stretch. */
	apply(): void {
		if (this.applying) return;
		const { names, rank } = this.viewer.coordinateSpace.value;
		if (rank === 0) return;
		const ratio = this.zoomRatio();
		this.applying = true;
		try {
			assignFactors(this.viewer.relativeDisplayScales, rank, (i) =>
				this.factorFor(names[i], ratio),
			);
			assignFactors(this.projection, rank, (i) => this.factorFor(names[i], 1));
		} finally {
			this.applying = false;
		}
	}

	/**
	 * In PHYSICAL units per pixel, not `crossSectionScale`'s canonical voxels:
	 * a factor below 1 makes elevation the canonical voxel, and Neuroglancer
	 * then rescales the zoom value we just read from. Multiplying the canonical
	 * size back in cancels that, so the ratio only tracks real zooming.
	 */
	private zoomRatio(): number {
		const { canonicalVoxelPhysicalSize } =
			this.viewer.displayDimensionRenderInfo.value;
		const zoom =
			this.viewer.crossSectionScale.value * canonicalVoxelPhysicalSize;
		if (!Number.isFinite(zoom) || zoom <= 0) return 1;
		this.anchorZoom ??= zoom;
		return zoom / this.anchorZoom;
	}

	private factorFor(name: string, ratio: number): number {
		const base = positive(this.base[name]) ?? 1;
		const damping = this.damping[name];
		const factor =
			damping === undefined || !Number.isFinite(damping) || damping === 0
				? base
				: base * ratio ** damping;
		return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
	}
}

/** Set `scales` to `factorAt(i)`, unless that's what it already holds. */
function assignFactors(
	scales: TrackableRelativeDisplayScales,
	rank: number,
	factorAt: (i: number) => number,
): void {
	const current = scales.value.factors;
	if (current.length !== rank) return;
	const factors = new Float64Array(rank);
	let differs = false;
	for (let i = 0; i < rank; ++i) {
		factors[i] = factorAt(i);
		if (factors[i] !== current[i]) differs = true;
	}
	if (differs) scales.setFactors(factors);
}

function positive(value: number | undefined): number | undefined {
	return value !== undefined && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function sameMap(
	a: Record<string, number>,
	b: Record<string, number>,
): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => a[key] === b[key]);
}
