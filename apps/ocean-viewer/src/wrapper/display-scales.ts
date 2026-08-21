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
 * Factors are kept by NAME and re-applied on every coordinate-space change:
 * Neuroglancer keys them by dimension id and re-maps by id, so they fall back
 * to 1 whenever the space is re-derived from the sources' `outputDimensions`.
 */

import type { Viewer } from "neuroglancer/unstable/viewer.js";

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

	constructor(private readonly viewer: Viewer) {
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
		const { relativeDisplayScales } = this.viewer;
		const current = relativeDisplayScales.value.factors;
		if (current.length !== rank) return;

		const ratio = this.zoomRatio();
		const factors = new Float64Array(rank);
		let differs = false;
		for (let i = 0; i < rank; ++i) {
			factors[i] = this.factorFor(names[i], ratio);
			if (factors[i] !== current[i]) differs = true;
		}
		if (!differs) return;
		this.applying = true;
		try {
			relativeDisplayScales.setFactors(factors);
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
