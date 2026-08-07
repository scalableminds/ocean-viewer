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
 * Identifier of a colormap the viewer can render. Colour data lives in
 * `@ocean-viewer/colormaps`: `cmocean`'s oceanographic maps, the perceptually
 * uniform matplotlib maps, and a few legacy ones (`ncview`, `rainbow`).
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
 * here; Neuroglancer layers are a polymorphic family (image/segmentation/
 * annotation/mesh/...) with many per-type fields not modelled. Unlike
 * {@link ViewerStateJson}, this type keeps a catch-all index signature, so
 * spreading a layer doesn't silently drop untyped fields.
 */
export interface NeuroglancerLayerJson {
	type?: string;
	name?: string;
	visible?: boolean;
	source?: unknown;
	/** GLSL fragment shader source (image/volume layers). */
	shader?: string;
	/**
	 * Ocean Viewer extension: resolved into `shader` before the state reaches
	 * Neuroglancer, and kept on the layer afterwards so the viewer's image layer
	 * can report {@link LayerValue}s in physical units. Neuroglancer ignores
	 * layer keys it doesn't know.
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
 * The expanded (object) form of `layout`, adding the 3D panel's camera type and
 * per-panel cross-section overrides to the shorthand string form's `type`.
 */
export interface DataPanelLayoutJson {
	type: DataPanelLayoutType;
	/** Orthographic instead of perspective 3D camera. Ocean Viewer defaults to `true`. */
	orthographicProjection?: boolean;
	crossSections?: Record<string, unknown>;
}

/**
 * Viewer state as exchanged over the Ocean Viewer protocol: the Neuroglancer
 * viewer-state JSON schema (the `#!{...}` format), hand-typed from
 * Neuroglancer's JSON API docs:
 * https://neuroglancer-docs.web.app/json/api/index.html
 *
 * Neuroglancer's own npm package doesn't export this as a type, so it's
 * derived from the docs above. A best-effort, non-exhaustive model of the
 * top-level fields (deeper per-layer-type shapes are left to
 * {@link NeuroglancerLayerJson}'s index signature); unlike that type, this one
 * has no catch-all index signature, so an uncovered field is a compile error
 * at the point of use rather than a silently-typed `unknown` — add it here
 * when that happens.
 *
 * There is no top-level Ocean Viewer extension; the only one is per-layer
 * (`oceanColormap`).
 */
export interface ViewerStateJson {
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
	layout?: DataPanelLayoutType | DataPanelLayoutJson;
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
 * Precedes any inbound message, so unless the viewer was built with a fixed
 * `VITE_PARENT_ORIGIN`, READY is the one message posted to `*` — it carries no
 * payload, so nothing is exposed.
 */
export interface ReadyMessage {
	type: "READY";
}

/** Outbound: viewer → portal. Serialised viewer state after user interaction. */
export interface ReportMessage {
	type: "REPORT";
	state: ViewerStateJson;
}

/** The value one layer has at a pointed-at position. */
export interface LayerValue {
	/** Layer name, as it appears in the viewer state's `layers[].name`. */
	name: string;
	/**
	 * Value at the position, or `null` when the layer has none there — outside
	 * its bounds, a chunk that hasn't loaded yet, a non-finite voxel (NaN, the
	 * missing-data convention), or the layer's `noDataValue` sentinel.
	 *
	 * A number for single-channel volumes, an array for multi-channel ones, a
	 * string for values that don't survive JSON (segmentation ids are `bigint`).
	 *
	 * In PHYSICAL units: an image layer's {@link ColormapSpec} packing
	 * (`scaleFactor` / `addOffset`) is applied, so the number matches what the
	 * colours show and what `valueMin` / `valueMax` are expressed in. A layer
	 * that declares no packing and no sentinel reports its stored value as-is.
	 */
	value: number | number[] | string | null;
}

/**
 * What the pointer is over: the position, and what each visible layer holds
 * there. Shared payload of {@link ClickMessage} and {@link HoverMessage}.
 */
export interface PointerSample {
	/**
	 * Raw world-space position in the viewer's global coordinate space, in the
	 * axis order of that state's `dimensions`.
	 */
	world: number[];
	/** One entry per visible layer, in viewer order. */
	layers: LayerValue[];
}

/**
 * Outbound: viewer → portal. A click inside a data panel.
 *
 * Only emitted for an actual click: a pan/rotate drag ends with a DOM click too,
 * and those are filtered out.
 */
export interface ClickMessage extends PointerSample {
	type: "CLICK";
}

/**
 * Outbound: viewer → portal. The pointer moved over the data — same payload as
 * {@link ClickMessage}, for driving a live readout.
 *
 * Throttled, and only sent while the pointer is over a data panel with a valid
 * position under it. There is no "pointer left the data" message: the last
 * HOVER stands until the next one.
 */
export interface HoverMessage extends PointerSample {
	type: "HOVER";
}

export type InboundMessage = ConfigMessage;
export type OutboundMessage =
	| ReadyMessage
	| ReportMessage
	| ClickMessage
	| HoverMessage;

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
