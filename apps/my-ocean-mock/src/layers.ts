import type { Layer } from "./types";

/**
 * Demo layers backed by real CMEMS ARCO zarr arrays, both from the same
 * product (GLOBAL_MULTIYEAR_PHY_001_030, daily 1/12°), so they share one
 * lon/lat/elevation lattice. Each array's index space maps into a shared
 * world space:
 *
 *   x = longitude in degrees east   (-180 + i_lon * step)
 *   y = latitude, flipped north-up  ( 80  - i_lat * step)
 *   elevation = 49 - i_level        (0 = surface … 49 = deepest, negated
 *                                    because Neuroglancer draws the third
 *                                    display dimension downwards)
 *
 * Time is a shared GLOBAL dimension (both arrays share one daily axis), so it
 * lives in world space alongside x/y/elevation rather than per-layer.
 *
 * IMPORTANT: every layer lists x, y, elevation FIRST in `outputDimensions`.
 * Neuroglancer derives the global dimension order from the first three output
 * dimensions of the loaded layer sources, so leading with x/y/elevation keeps
 * the 4-panel display and position array aligned regardless of which layers
 * are visible or load first. `time` trails last since it isn't part of that.
 *
 * All three arrays are CF-packed int16 (`<i2`): physical value is
 * `raw * scaleFactor + addOffset`, passed through to the shader via the
 * protocol so `min`/`max` stay in physical units. The `-32767` fill (land /
 * below sea floor) is checked BEFORE unpacking.
 */
const GRID_STEP = 1 / 12; // 0.083° grid step
const N_LEVELS = 50; // elevation axis length (so, thetao)
const TIME_INDEX = 12000; // daily index into the 12227-step time axis

const ROOT = "https://s3.waw3-1.cloudferro.com";
const DATASET = `${ROOT}/mdl-arco-time-025/arco/GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/timeChunked.zarr`;

const TEMPERATURE_URL = `${DATASET}/thetao/|zarr2:`;
const SALINITY_URL = `${DATASET}/so/|zarr2:`;

/** CMEMS fill value shared by both packed arrays. */
const FILL = -32767;

/**
 * Transform for the 4-D fields. Input dims: [time, elevation, latitude,
 * longitude]; output dims: [x, y, elevation, time].
 */
const VOLUME_TRANSFORM = {
	outputDimensions: {
		x: [1, ""] as [number, string],
		y: [1, ""] as [number, string],
		elevation: [1, ""] as [number, string],
		time: [1, ""] as [number, string],
	},
	matrix: [
		[0, 0, 0, GRID_STEP, -180], // x = -180 + lon*step
		[0, 0, -GRID_STEP, 0, 80], // y = 80 - lat*step (north-up)
		[0, -1, 0, 0, N_LEVELS - 1], // elevation = 49 - level (surface-up)
		[1, 0, 0, 0, 0], // time = time index
	],
};

export const INITIAL_LAYERS: Layer[] = [
	{
		id: "so",
		title: "Sea water salinity",
		shortName: "so",
		subtitle: "Global daily",
		unit: "PSU",
		source: { url: SALINITY_URL, ...VOLUME_TRANSFORM },
		noData: FILL,
		scaleFactor: 0.0015259254723787308,
		addOffset: -0.0015259254723787308,
		visible: false,
		opacity: 1,
		colormap: "haline",
		invert: false,
		min: 0.0015,
		max: 42.5,
		scale: "linear",
	},
	{
		id: "thetao",
		title: "Sea water potential temperature",
		shortName: "thetao",
		subtitle: "Global daily",
		unit: "°C",
		source: { url: TEMPERATURE_URL, ...VOLUME_TRANSFORM },
		noData: FILL,
		scaleFactor: 0.0007324442267417908,
		addOffset: 21.0,
		visible: true,
		opacity: 1,
		colormap: "thermal",
		invert: false,
		min: -3,
		max: 30,
		scale: "linear",
	},
];
