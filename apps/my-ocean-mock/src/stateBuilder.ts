import type {
	NeuroglancerLayerJson,
	ViewerStateJson,
} from "@ocean-viewer/protocol";
import { N_TIMES } from "./layers";
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
 * This does NOT pin the dimension order, and its scales are inert.
 * Neuroglancer always derives both from the loaded layer sources'
 * `outputDimensions` — a layer set that omits `elevation` collapses the space
 * to x/y/time no matter what is declared here, and a vertical exaggeration has
 * to go on the source transform rather than on this constant.
 *
 * What it does do is give `position` a named frame at restore time, before any
 * source metadata has arrived. Without it the initial CONFIG's position is
 * discarded and the viewer opens at the centre of the data bounds instead.
 *
 * Sent on every update, full or partial: `restoreState` resets any key the
 * state omits, so dropping it from a partial would clear the declared space.
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
 * 4-panel layout shows the lon/lat map plus elevation sections. `position`
 * seeds an accessible slice: lon 0°, lat 0°, surface, most recent day.
 *
 * It must carry one entry per dimension in {@link DIMENSIONS}. Neuroglancer
 * silently discards a position whose length doesn't match the coordinate
 * space's rank and opens at the centre of the data bounds instead.
 */
export function buildFullState(
	layers: Layer[],
	verticalExaggeration = 1,
	zoomDamping = 0,
): ViewerStateJson {
	return {
		dimensions: DIMENSIONS,
		// Unlike the scales in `DIMENSIONS` this one is not inert. x spans 360° and
		// y 160° against elevation's ~50 levels, so a factor of a few makes the
		// sections frame the water column at the zoom that frames the map.
		relativeDisplayScales: { elevation: verticalExaggeration },
		// How much of the shared zoom the elevation axis ignores: 0 none, 1 all.
		oceanZoomDamping: { elevation: zoomDamping },
		// `elevation` counts up from the sea floor (see the transform in
		// `layers.ts`), so the surface sits at the top of the axis.
		position: [0, 0, 0, N_TIMES - 1],
		crossSectionScale: 0.9,
		projectionScale: 250,
		layout: "4panel-alt",
		layers: layersToState(layers),
	};
}
