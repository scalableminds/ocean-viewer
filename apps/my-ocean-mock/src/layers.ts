import type { Layer } from "./types";

/**
 * Demo layers backed by real CMEMS ARCO zarr arrays (the three from the MyOcean
 * screenshots). Each array's index space is mapped into a shared world space:
 *
 *   x = longitude in degrees east   (-180 + i_lon * step)
 *   y = latitude, flipped north-up  ( 80  - i_lat * step)
 *   z = elevation index (0 = deepest ~-5728 m … 49 = surface ~-0.5 m)
 *   t / tc = time index (thetao and chl have independent time axes)
 *
 * Grids: deptho & thetao are 1/12° (4320×2041), chl is 1/4° (1440×1440). Sharing
 * x/y/z by name overlays them; thetao keeps its own time `t`, chl its own `tc`.
 * deptho is static (no time / elevation). See README for how this was derived.
 *
 * IMPORTANT: every layer lists x, y, z FIRST in `outputDimensions`. Neuroglancer
 * derives the global dimension order from the loaded layer sources and uses the
 * first three as the 4-panel display dimensions. Leading with x/y/z guarantees
 * the panels show the lon/lat map (+ elevation sections) and that the position
 * array stays aligned, regardless of which layers are visible or load first.
 */
const HI = 1 / 12; // 0.083° grid step (deptho, thetao)
const LO = 0.25; // 0.25° grid step (chl)

const ROOT = "https://s3.waw3-1.cloudferro.com";

const DEPTHO_URL = `${ROOT}/mdl-arco-time-015/arco/GLOBAL_ANALYSISFORECAST_WAV_001_027/cmems_mod_wav_anfc_0.083deg_static_202211--ext--bathy/static.zarr/deptho/|zarr2:`;
// const THETAO_URL = `${ROOT}/mdl-arco-geo-012/arco/GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m_202406/geoChunked.zarr/thetao/|zarr2:`;
const THETAO_URL = `${ROOT}/mdl-arco-time-012/arco/GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m_202406/timeChunked.zarr/thetao/|zarr2:`;
const CHL_URL = `${ROOT}/mdl-arco-time-006/arco/GLOBAL_ANALYSISFORECAST_BGC_001_028/cmems_mod_glo_bgc-plankton_anfc_0.25deg_P1M-m_202411/timeChunked.zarr/zooc/|zarr2:`;

export const INITIAL_LAYERS: Layer[] = [
	{
		id: "deptho",
		title: "Sea floor depth below geoid",
		shortName: "deptho",
		subtitle: "Global",
		unit: "m",
		// input dims: [latitude, longitude]
		source: {
			url: DEPTHO_URL,
			outputDimensions: { x: [1, ""], y: [1, ""] },
			matrix: [
				[0, HI, -180], // x = -180 + lon*step
				[-HI, 0, 80], // y = 80 - lat*step (north-up)
			],
		},
		noData: -32767,
		// NOTE: this deptho array is float64 (`<f8`), which Neuroglancer cannot
		// decode ("Unsupported numpy data type"). It stays in the panel for UI
		// parity but will not render until served as float32. thetao/chl are f4.
		visible: false,
		opacity: 1,
		colormap: "viridis",
		min: 0,
		max: 300,
		scale: "linear",
	},
	{
		id: "thetao",
		title: "Sea water potential temperature",
		shortName: "thetao",
		subtitle: "Global daily",
		unit: "°C",
		// input dims: [time, elevation, latitude, longitude]
		source: {
			url: THETAO_URL,
			outputDimensions: { x: [1, ""], y: [1, ""], z: [1, ""], t: [1, ""] },
			matrix: [
				[0, 0, 0, HI, -180], // x = -180 + lon*step
				[0, 0, -HI, 0, 80], // y = 80 - lat*step (north-up)
				[0, 1, 0, 0, 0], // z = elevation index
				[1, 0, 0, 0, 0], // t = time index
			],
		},
		visible: true,
		opacity: 1,
		colormap: "magma",
		min: 0,
		max: 30,
		scale: "linear",
	},
	{
		id: "chl",
		title: "Mass concentration of chlorophyll a in sea water",
		shortName: "chl",
		subtitle: "Global daily",
		unit: "mg/m³",
		// input dims: [time, elevation, latitude, longitude]; own time axis `tc`
		source: {
			url: CHL_URL,
			outputDimensions: { x: [1, ""], y: [1, ""], z: [1, ""], tc: [1, ""] },
			matrix: [
				[0, 0, 0, LO, -180], // x = -180 + lon*step
				[0, 0, -LO, 0, 80], // y = 80 - lat*step (north-up)
				[0, 1, 0, 0, 0], // z = elevation index
				[1, 0, 0, 0, 0], // tc = time index
			],
		},
		visible: false,
		opacity: 1,
		colormap: "viridis",
		min: 0.01,
		max: 10,
		scale: "log",
	},
];
