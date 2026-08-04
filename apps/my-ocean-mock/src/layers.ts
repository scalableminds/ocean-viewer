import type { Layer } from "./types";

/**
 * Demo layers backed by real CMEMS ARCO zarr arrays, all three from the same
 * product (GLOBAL_MULTIYEAR_PHY_001_030, daily 1/12°), so they share one
 * lon/lat/elevation lattice. Each array's index space is mapped into a shared
 * world space:
 *
 *   x = longitude in degrees east   (-180 + i_lon * step)
 *   y = latitude, flipped north-up  ( 80  - i_lat * step)
 *   elevation = 49 - i_level        (0 = surface … 49 = deepest)
 *
 * The array's `elevation` coordinate is ASCENDING and runs from -5727.9 m at
 * index 0 to -0.494 m at index 49, i.e. index 0 is the DEEPEST level. The world
 * axis is negated (like y) because Neuroglancer's section panels draw the third
 * display dimension downwards; with `elevation = i_level` the ocean renders
 * upside down.
 *
 * Time is a per-layer LOCAL dimension (`time'`), not part of the world space —
 * the three arrays are on the same daily axis, but keeping it local matches how
 * the portal will drive time (per layer, via CONFIG) and keeps the global
 * position array to x/y/elevation. Neuroglancer marks local dimensions by a
 * trailing apostrophe in the transform's `outputDimensions`; the layer-level
 * `localDimensions`/`localPosition` pair then pins the slice.
 *
 * Ranks differ per variable: so/thetao are 4-D (time, elevation, latitude,
 * longitude), usi is 3-D (time, latitude, longitude) — sea-ice fields have no
 * depth axis. A source transform's matrix is always
 * `outputDimensions.length` rows × (input rank + 1) columns, and the number of
 * output dimensions must match the array's rank, so usi's transform is one row
 * and one column smaller and simply has no elevation output (it then shows at
 * every elevation, as static `deptho` used to).
 *
 * IMPORTANT: every layer lists x, y, elevation FIRST in `outputDimensions`.
 * Neuroglancer derives the global dimension order from the loaded layer sources
 * and uses the first three as the 4-panel display dimensions. Leading with
 * x/y/elevation guarantees the panels show the lon/lat map (+ elevation
 * sections) and that the position array stays aligned, regardless of which
 * layers are visible or load first. Local dimensions are excluded from the
 * global space, so `time'` may come last.
 *
 * All three arrays are CF-packed int16 (`<i2`): the physical value is
 * `raw * scaleFactor + addOffset`. Neuroglancer returns the raw integer, so the
 * packing is passed through to the shader via the protocol's
 * `scaleFactor`/`addOffset`, which lets `min`/`max` stay in physical units. The
 * `-32767` fill (land / below sea floor) is checked BEFORE unpacking.
 */
const GRID_STEP = 1 / 12; // 0.083° grid step
const N_LEVELS = 50; // elevation axis length (so, thetao)
const TIME_INDEX = 12000; // daily index into the 12227-step time axis

const ROOT = "https://s3.waw3-1.cloudferro.com";
const DATASET = `${ROOT}/mdl-arco-time-025/arco/GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/timeChunked.zarr`;

const TEMPERATURE_URL = `${DATASET}/thetao/|zarr2:`;
const SALINITY_URL = `${DATASET}/so/|zarr2:`;
const ICE_VELOCITY_URL = `${DATASET}/usi/|zarr2:`;

/** CMEMS fill value shared by all three packed arrays. */
const FILL = -32767;

/** Local time axis: one dimension, pinned to {@link TIME_INDEX}. */
const LOCAL_TIME = {
	localDimensions: { "time'": [1, ""] as [number, string] },
	localPosition: [TIME_INDEX],
};

/**
 * Transform for the 4-D fields. Input dims: [time, elevation, latitude,
 * longitude]; output dims: [x, y, elevation, time'].
 */
const VOLUME_TRANSFORM = {
	outputDimensions: {
		x: [1, ""] as [number, string],
		y: [1, ""] as [number, string],
		elevation: [1, ""] as [number, string],
		"time'": [1, ""] as [number, string],
	},
	matrix: [
		[0, 0, 0, GRID_STEP, -180], // x = -180 + lon*step
		[0, 0, -GRID_STEP, 0, 80], // y = 80 - lat*step (north-up)
		[0, -1, 0, 0, N_LEVELS - 1], // elevation = 49 - level (surface-up)
		[1, 0, 0, 0, 0], // time' = time index (local)
	],
};

/**
 * Transform for the 3-D sea-ice fields. Input dims: [time, latitude,
 * longitude]; output dims: [x, y, time'] — no elevation axis.
 *
 * `subsources` turns off the zarr driver's `bounds` subsource: the yellow
 * data-bounds box. Neuroglancer starts every dimension's bound at ±Infinity
 * and narrows only the ones a source constrains, so for a layer that has no
 * elevation output the box is infinite along elevation — an edgeless slab that
 * fills the section and 3D panels at every zoom. The volume itself is the
 * `default` subsource and stays enabled (`subsources` only overrides the ids it
 * names). The 4-D layers constrain all three world axes, so they keep theirs.
 */
const SURFACE_TRANSFORM = {
	outputDimensions: {
		x: [1, ""] as [number, string],
		y: [1, ""] as [number, string],
		"time'": [1, ""] as [number, string],
	},
	matrix: [
		[0, 0, GRID_STEP, -180], // x = -180 + lon*step
		[0, -GRID_STEP, 0, 80], // y = 80 - lat*step (north-up)
		[1, 0, 0, 0], // time' = time index (local)
	],
	subsources: { bounds: false },
};

export const INITIAL_LAYERS: Layer[] = [
	{
		id: "so",
		title: "Sea water salinity",
		shortName: "so",
		subtitle: "Global daily",
		unit: "PSU",
		source: { url: SALINITY_URL, ...VOLUME_TRANSFORM },
		...LOCAL_TIME,
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
		...LOCAL_TIME,
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
	{
		id: "usi",
		title: "Eastward sea ice velocity",
		shortName: "usi",
		subtitle: "Global daily",
		unit: "m/s",
		source: { url: ICE_VELOCITY_URL, ...SURFACE_TRANSFORM },
		...LOCAL_TIME,
		noData: FILL,
		scaleFactor: 3.0518509447574615e-5,
		addOffset: 0,
		visible: true,
		opacity: 1,
		colormap: "delta",
		invert: false,
		min: -1,
		max: 1,
		scale: "linear",
	},
];
