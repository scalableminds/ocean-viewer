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
	/**
	 * Output dimensions of the transform: name → [scale, unit]. Names ending in
	 * `'` are Neuroglancer LOCAL dimensions (per-layer, e.g. `time'`) and are
	 * kept out of the global coordinate space; all others are world dimensions.
	 * There must be exactly one entry per input dimension of the array.
	 */
	outputDimensions: Record<string, [number, string]>;
	/** Affine matrix (output_rank × input_rank+1) mapping index → world. */
	matrix: number[][];
	/**
	 * Per-subsource enable overrides (`id → enabled`). The zarr driver publishes
	 * two: `default` (the volume) and `bounds` (the yellow data-bounds box).
	 * Ids listed here override their default; the rest follow
	 * `enableDefaultSubsources`.
	 */
	subsources?: Record<string, boolean>;
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
	/**
	 * Per-layer local coordinate space (name → [scale, unit]), for dimensions the
	 * source transform emits with a trailing `'`. Sent as the Neuroglancer
	 * layer's `localDimensions`.
	 */
	localDimensions?: Record<string, [number, string]>;
	/** Position within {@link localDimensions}, e.g. the time index. */
	localPosition?: number[];
	/** No-data sentinel rendered transparent (e.g. -32767 for bathymetry). */
	noData?: number;
	/**
	 * CF packing of the stored array: physical = raw * `scaleFactor` +
	 * `addOffset`. Set for the int16-packed CMEMS arrays so {@link min}/{@link max}
	 * can be given in physical units.
	 */
	scaleFactor?: number;
	addOffset?: number;
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
