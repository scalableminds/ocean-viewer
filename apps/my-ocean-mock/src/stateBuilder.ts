import type {
	NeuroglancerLayerJson,
	ViewerStateJson,
} from "@ocean-viewer/protocol";
import type { Layer } from "./types";

/** Translate one UI layer into a Neuroglancer image layer + `oceanColormap`. */
function toNeuroglancerLayer(layer: Layer): NeuroglancerLayerJson {
	return {
		type: "image",
		name: layer.shortName,
		visible: layer.visible,
		opacity: layer.opacity,
		source: {
			url: layer.source.url,
			transform: {
				matrix: layer.source.matrix,
				outputDimensions: layer.source.outputDimensions,
			},
			enableDefaultSubsources: true,
			// Overrides for individual subsources; ids not listed keep the default
			// dictated by `enableDefaultSubsources`.
			...(layer.source.subsources !== undefined
				? { subsources: layer.source.subsources }
				: {}),
		},
		// Local (non-world) dimensions live on the LAYER, not on the source
		// transform — the transform only declares them by naming its output
		// dimension with a trailing `'`.
		...(layer.localDimensions !== undefined
			? { localDimensions: layer.localDimensions }
			: {}),
		...(layer.localPosition !== undefined
			? { localPosition: layer.localPosition }
			: {}),
		oceanColormap: {
			colormapId: layer.colormap,
			valueMin: layer.min,
			valueMax: layer.max,
			logScale: layer.scale === "log",
			colormapInvert: layer.invert,
			valueClamp: true,
			...(layer.noData !== undefined ? { noDataValue: layer.noData } : {}),
			...(layer.scaleFactor !== undefined
				? { scaleFactor: layer.scaleFactor }
				: {}),
			...(layer.addOffset !== undefined ? { addOffset: layer.addOffset } : {}),
		},
	};
}

/** The `layers` array of a CONFIG, derived from the current UI layer list. */
export function layersToState(layers: Layer[]): NeuroglancerLayerJson[] {
	return layers.map(toNeuroglancerLayer);
}

/**
 * Shared world coordinate space: x (°E), y (°N), elevation (level index) and
 * time (daily index) — all layers share one time axis, so it's global rather
 * than a per-layer local dimension.
 *
 * It must be sent on EVERY update — including partial ones — to pin the
 * dimension order. If a partial update omits it, Neuroglancer recomputes the
 * coordinate space from the currently-visible layers (e.g. dropping elevation
 * when only the 3-D sea-ice layer is shown), which misaligns the preserved
 * position array and breaks the view.
 */
const DIMENSIONS: Record<string, [number, string]> = {
	x: [1, ""],
	y: [1, ""],
	elevation: [1, ""],
	time: [1, ""],
};

/**
 * Build the initial full CONFIG state.
 *
 * Display dimensions default to the first three (x, y, elevation), so the
 * 4-panel layout shows the lon/lat map plus lon/elevation and lat/elevation
 * sections. Position must have one entry per entry in {@link DIMENSIONS} and
 * seeds an accessible slice: lon 0°, lat 0°, surface (elevation index 0, which
 * the transform maps from level 49). The time index is seeded per layer.
 */
export function buildFullState(layers: Layer[]): ViewerStateJson {
	return {
		dimensions: DIMENSIONS,
		oceanAxisUnits: { x: "°E", y: "°N" },
		position: [0, 0, 0],
		crossSectionScale: 0.9,
		projectionScale: 2048,
		layout: "4panel-alt",
		layers: layersToState(layers),
	};
}
