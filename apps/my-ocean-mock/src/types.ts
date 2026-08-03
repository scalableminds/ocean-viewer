import type { ColormapId } from "@ocean-viewer/protocol";

/**
 * The Neuroglancer `source` plumbing for a layer: the kvstore URL plus the
 * transform that maps the array's index space into the shared world space
 * (degrees east / north, elevation index, time index). This is fixed per
 * dataset and not edited through the UI.
 */
export interface LayerSource {
	/** Neuroglancer kvstore URL, e.g. ".../static.zarr/deptho/|zarr2:". */
	url: string;
	/** Output (world) dimensions of the transform: name → [scale, unit]. */
	outputDimensions: Record<string, [number, string]>;
	/** Affine matrix (output_rank × input_rank+1) mapping index → world. */
	matrix: number[][];
}

/**
 * A single layer as modelled by the mock portal UI. The left-hand panel edits
 * the visual fields (visibility, opacity, colormap, min/max, scale); `source`
 * and `noData` are dataset plumbing translated into Neuroglancer state.
 */
export interface Layer {
	/** Stable id used as React key and to preserve order. */
	id: string;
	/** Human-readable title (e.g. "Sea water potential temperature"). */
	title: string;
	/** Short variable name shown beside the title (e.g. "thetao"). */
	shortName: string;
	/** Sub-label under the title (e.g. "Global daily"). */
	subtitle: string;
	/** Physical unit of the variable, shown on the colour bar (e.g. "°C"). */
	unit: string;
	/** Neuroglancer source + index→world transform. */
	source: LayerSource;
	/** No-data sentinel rendered transparent (e.g. -32767 for bathymetry). */
	noData?: number;
	/** Whether the layer is rendered. */
	visible: boolean;
	/** Layer opacity in [0, 1]. */
	opacity: number;
	/** Selected colormap. */
	colormap: ColormapId;
	/** Render {@link colormap} in reverse order (the protocol's `colormapInvert`). */
	invert: boolean;
	/** Lower clamp bound (data value mapped to colormap 0.0). */
	min: number;
	/** Upper clamp bound (data value mapped to colormap 1.0). */
	max: number;
	/** Linear or logarithmic value scaling. */
	scale: "linear" | "log";
}
