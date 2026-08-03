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
		},
		oceanColormap: {
			colormapId: layer.colormap,
			valueMin: layer.min,
			valueMax: layer.max,
			logScale: layer.scale === "log",
			valueClamp: true,
			...(layer.noData !== undefined ? { noDataValue: layer.noData } : {}),
		},
	};
}

/** The `layers` array of a CONFIG, derived from the current UI layer list. */
export function layersToState(layers: Layer[]): NeuroglancerLayerJson[] {
	return layers.map(toNeuroglancerLayer);
}

/**
 * Shared world coordinate space: x (°E), y (°N), z (elevation index), and the
 * two independent time axes t (thetao) and tc (chl). It must be sent on EVERY
 * update — including partial ones — to pin the dimension order. If a partial
 * update omits it, Neuroglancer recomputes the coordinate space from the
 * currently-visible layers (e.g. dropping thetao's t/z when it is hidden), which
 * misaligns the preserved position array and breaks the view.
 */
const DIMENSIONS: Record<string, [number, string]> = {
	x: [1, ""],
	y: [1, ""],
	z: [1, ""],
	t: [1, ""],
	tc: [1, ""],
};

/**
 * Build the initial full CONFIG state.
 *
 * The shared world space has dimensions x (°E), y (°N), z (elevation index),
 * and the two independent time axes t (thetao) and tc (chl). Display dimensions
 * default to the first three (x, y, z), so the 4-panel layout shows the lon/lat
 * map plus lon/elevation and lat/elevation sections; t and tc are scrubbed via
 * the position widget. Position seeds an accessible slice: surface (z = 49) at
 * the time indices CMEMS currently serves (t = 423, tc = 635).
 */
export function buildFullState(layers: Layer[]): ViewerStateJson {
	return {
		dimensions: DIMENSIONS,
		oceanAxisUnits: { x: "°E", y: "°N" },
		position: [0, 0, 49, 423, 635],
		crossSectionScale: 0.9,
		projectionScale: 2048,
		layout: "4panel-alt",
		layers: layersToState(layers),
	};
}
