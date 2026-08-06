/**
 * Message contract between the MyOcean Data Portal (parent page) and the
 * embedded Ocean Viewer iframe.
 *
 * All messages share a small envelope so the bridge can discriminate types and
 * ignore unrelated `postMessage` traffic on the same window. The `namespace`
 * field is a constant marker; `type` selects the payload shape.
 *
 * NOTE: the exact wire schema is still to be finalised with the MyOcean team
 * (see the implementation plan's open items). This module is the single source
 * of truth for it on the viewer side.
 */

/** Marker identifying messages belonging to the Ocean Viewer protocol. */
export const PROTOCOL_NAMESPACE = "ocean-viewer" as const;

/**
 * Identifier of a colormap the viewer can render. A colormap's id is its name;
 * the colour data behind each one lives in `@ocean-viewer/colormaps` and is
 * turned into GLSL by the viewer's `wrapper/colormaps.ts`.
 *
 * The set is the standard ocean-data palette collection: `cmocean`'s
 * oceanographic maps, the perceptually uniform matplotlib maps, and a few
 * legacy ones (`ncview`, `rainbow`) kept for continuity with existing tooling.
 */
export type ColormapId =
	| "algae"
	| "amp"
	| "balance"
	| "bloom"
	| "cividis"
	| "cyclic"
	| "delta"
	| "dense"
	| "difference"
	| "gray"
	| "haline"
	| "ice"
	| "inferno"
	| "magma"
	| "matter"
	| "ncview"
	| "ocean"
	| "plasma"
	| "rainbow"
	| "solar"
	| "speed"
	| "tempo"
	| "ternary"
	| "thermal"
	| "twilight"
	| "viridis";

/**
 * The Data Portal's colormap extension for an image layer (`oceanColormap`),
 * resolved into a Neuroglancer `shader` by `wrapper/colormaps.ts`'s
 * `resolveShader` / `resolveStateColormaps`.
 */
export interface ColormapSpec {
	/** A {@link ColormapId}, or a raw GLSL shader string (detected by content). */
	colormapId: ColormapId | string;
	/** Data value mapped to colormap 0.0 (1.0 when {@link colormapInvert} is set). */
	valueMin: number;
	/** Data value mapped to colormap 1.0 (0.0 when {@link colormapInvert} is set). */
	valueMax: number;
	/** Logarithmic (true) or linear (default, false) normalisation. */
	logScale?: boolean;
	/** Clamp out-of-range values to the endpoints (default false). */
	valueClamp?: boolean;
	/** Use the colormap identified by {@link colormapId} in reverse order (default false). */
	colormapInvert?: boolean;
	/**
	 * Explicit no-data sentinel (e.g. CMEMS bathymetry's `-32767`). Voxels equal
	 * to it render transparent. NaN and the CMEMS default fill (~9.969e36) are
	 * always treated as missing without needing this. Checked against the RAW
	 * stored value, before any scale/offset is applied.
	 */
	noDataValue?: number;
	/**
	 * CF packing: physical value = raw * `scaleFactor` + `addOffset`. Needed for
	 * CMEMS int16-packed arrays, since Neuroglancer reads the raw stored integer
	 * and does not apply `scale_factor`/`add_offset`. Defaults: 1 / 0 (identity),
	 * so float32 layers with real physical values are unaffected.
	 */
	scaleFactor?: number;
	addOffset?: number;
}

/**
 * One entry in a Neuroglancer viewer state's `layers` array.
 *
 * Only the handful of fields Ocean Viewer reads or writes directly are typed
 * here. Neuroglancer layers are a polymorphic family (image/segmentation/
 * annotation/mesh/...) with many per-type fields not modelled — see the docs
 * linked on {@link NeuroglancerViewerStateJson}. Unlike that type, this one
 * keeps a catch-all index signature: layer shape varies by `type` far more
 * than we model, and without it, spreading a layer (`{ ...layer, ... }`, as
 * `resolveStateColormaps` does) would silently drop those fields from the
 * result's *type* even though they're still present on the actual object.
 */
export interface NeuroglancerLayerJson {
	type?: string;
	name?: string;
	visible?: boolean;
	source?: unknown;
	/** GLSL fragment shader source (image/volume layers). */
	shader?: string;
	/**
	 * Ocean Viewer extension: resolved into `shader` and stripped before the
	 * state reaches Neuroglancer. See `resolveStateColormaps` in
	 * `wrapper/colormaps.ts`.
	 */
	oceanColormap?: ColormapSpec;
	[key: string]: unknown;
}

/** One of Neuroglancer's built-in multi-panel data panel layouts. */
export type DataPanelLayoutType =
	| "4panel-alt"
	| "4panel"
	| "xy"
	| "xz"
	| "yz"
	| "3d"
	| "xy-3d"
	| "xz-3d"
	| "yz-3d";

/**
 * The Neuroglancer viewer-state JSON schema (the `#!{...}` format), hand-typed
 * from Neuroglancer's JSON API docs:
 * https://neuroglancer-docs.web.app/json/api/index.html
 *
 * Neuroglancer's own npm package doesn't export this as a type — its state is
 * `any` end-to-end (see `Trackable`/`CompoundTrackable.toJSON()` in
 * `neuroglancer/util/trackable`), so this is derived from the docs above
 * rather than imported. It's a best-effort, non-exhaustive model of the
 * top-level fields (deeper per-layer-type shapes are intentionally left to
 * {@link NeuroglancerLayerJson}'s index signature) — but unlike that type,
 * this one has no catch-all index signature of its own. The top-level schema
 * is small enough to enumerate, so a field this doesn't cover yet should be a
 * compile error at the point of use, not a silently-typed `unknown` — add it
 * here when that happens.
 */
export interface NeuroglancerViewerStateJson {
	dimensions?: Record<string, [scale: number, unit: string]>;
	relativeDisplayScales?: number[];
	displayDimensions?: string[];
	position?: number[];
	crossSectionOrientation?: [number, number, number, number];
	crossSectionScale?: number;
	crossSectionDepth?: number;
	projectionOrientation?: [number, number, number, number];
	projectionScale?: number;
	projectionDepth?: number;
	layers?: NeuroglancerLayerJson[];
	layout?: DataPanelLayoutType | Record<string, unknown>;
	showAxisLines?: boolean;
	wireFrame?: boolean;
	showScaleBar?: boolean;
	showDefaultAnnotations?: boolean;
	showSlices?: boolean;
	hideCrossSectionBackground3D?: boolean;
	gpuMemoryLimit?: number;
	systemMemoryLimit?: number;
	concurrentDownloads?: number;
	prefetch?: boolean;
	title?: string;
}

/**
 * Viewer state as exchanged over the Ocean Viewer protocol: Neuroglancer's
 * schema (above) plus the Ocean Viewer-only `oceanAxisUnits` extension — a
 * `{ dimensionName: unitString }` map used to label the X/Y/Z position
 * readouts (e.g. `{ "x": "°E", "y": "°N", "z": "m" }`). Needed because
 * Neuroglancer's coordinate-space units are SI-only and reject `"°"`. The
 * wrapper strips it before handing the state to Neuroglancer — see
 * `wrapper/units.ts` (`setAxisUnits`).
 */
export type ViewerStateJson = NeuroglancerViewerStateJson & {
	oceanAxisUnits?: Record<string, string>;
};

/** Inbound: portal → viewer. */
export interface ConfigMessage {
	type: "CONFIG";
	/**
	 * Viewer state in Neuroglancer JSON schema.
	 *
	 * The first CONFIG is treated as the full state (applied with a reset).
	 * Subsequent CONFIGs are partial updates merged onto the current state,
	 * preserving camera position/orientation unless those fields are explicitly
	 * present. `mode` overrides this ordering heuristic when set.
	 */
	state: ViewerStateJson;
	mode?: "full" | "partial";
}

/**
 * Outbound: viewer → portal. Sent once, as soon as the viewer is initialised
 * and its bridge is listening, so the portal knows when a CONFIG will be
 * received rather than having to guess with a timeout.
 *
 * Because it precedes any inbound message, the origin handshake has not run
 * yet: unless the viewer was built with a fixed `VITE_PARENT_ORIGIN`, READY is
 * the one message posted to `*`. It carries no payload, so nothing is exposed.
 */
export interface ReadyMessage {
	type: "READY";
}

/** Outbound: viewer → portal. Serialised viewer state after user interaction. */
export interface ReportMessage {
	type: "REPORT";
	state: ViewerStateJson;
}

/** Geographic coordinates derived from a world-space click. */
export interface GeographicCoordinate {
	longitude: number;
	latitude: number;
	depth: number;
	/** Any additional (non-spatial) dimensions, e.g. `time`, keyed by name. */
	extra?: Record<string, number>;
	/** Physical units per geographic/extra axis, when known. */
	units?: Record<string, string>;
}

/** Outbound: viewer → portal. Mouse click with world + geographic coordinates. */
export interface ClickMessage {
	type: "CLICK";
	/** Raw world-space position in the viewer's global coordinate space. */
	world: number[];
	geographic: GeographicCoordinate;
}

export type InboundMessage = ConfigMessage;
export type OutboundMessage = ReadyMessage | ReportMessage | ClickMessage;

/** Full message as it travels over `postMessage`: the payload plus `namespace`. */
export type Message<M extends { type: string }> = M & {
	namespace: typeof PROTOCOL_NAMESPACE;
};

export function isOceanMessage(
	data: unknown,
): data is Message<{ type: string }> {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { namespace?: unknown }).namespace === PROTOCOL_NAMESPACE &&
		typeof (data as { type?: unknown }).type === "string"
	);
}

export function isConfigMessage(
	data: Message<{ type: string }>,
): data is Message<ConfigMessage> {
	return (
		data.type === "CONFIG" &&
		typeof (data as { state?: unknown }).state === "object" &&
		(data as { state?: unknown }).state !== null
	);
}
