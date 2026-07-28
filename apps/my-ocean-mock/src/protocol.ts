import type { Layer } from "./types";

/**
 * Wire contract with the Ocean Viewer iframe. Mirrors `src/protocol.ts` in the
 * viewer: messages share a `namespace` marker; `type` selects the payload. We
 * only need the outbound CONFIG side here, plus recognising inbound REPORT/CLICK.
 */
export const PROTOCOL_NAMESPACE = "ocean-viewer" as const;

/** Plain Neuroglancer state JSON (the `#!{...}` schema), with Ocean extensions. */
export type ViewerStateJson = Record<string, unknown>;

export interface ConfigMessage {
	namespace: typeof PROTOCOL_NAMESPACE;
	type: "CONFIG";
	state: ViewerStateJson;
	mode: "full" | "partial";
}

/** Translate one UI layer into a Neuroglancer image layer + `oceanColormap`. */
function toNeuroglancerLayer(layer: Layer): ViewerStateJson {
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
			colormap: layer.colormap,
			dataMin: layer.min,
			dataMax: layer.max,
			scale: layer.scale,
			clamp: true,
			...(layer.noData !== undefined ? { noDataValue: layer.noData } : {}),
		},
	};
}

/** The `layers` array of a CONFIG, derived from the current UI layer list. */
export function layersToState(layers: Layer[]): ViewerStateJson[] {
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
const DIMENSIONS = {
	x: [1, ""],
	y: [1, ""],
	z: [1, ""],
	t: [1, ""],
	tc: [1, ""],
} as const;

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
