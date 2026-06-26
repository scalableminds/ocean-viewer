/**
 * Message contract between the MyOcean Data Portal (parent page) and the
 * embedded Ocean Viewer iframe.
 *
 * All messages share a small envelope so the bridge can discriminate types and
 * ignore unrelated `postMessage` traffic on the same window. The `source` field
 * is a constant marker; `type` selects the payload shape.
 *
 * NOTE: the exact wire schema is still to be finalised with the MyOcean team
 * (see the implementation plan's open items). This module is the single source
 * of truth for it on the viewer side.
 */

/** Marker identifying messages belonging to the Ocean Viewer protocol. */
export const PROTOCOL_SOURCE = "ocean-viewer" as const;

/**
 * A Neuroglancer viewer-state JSON object (the `#!{...}` schema).
 *
 * Ocean Viewer extends it with non-standard fields the wrapper consumes and
 * strips before handing the state to Neuroglancer:
 *
 * - `oceanColormap` (on an image layer) — a named-colormap spec resolved into
 *   the layer's GLSL `shader`. Shape:
 *     { colormap: "viridis" | "magma" | ... | <raw GLSL>,
 *       dataMin: number, dataMax: number,
 *       scale?: "linear" | "log", clamp?: boolean }
 *   See `wrapper/colormaps.ts` (`ColormapSpec`, `resolveStateColormaps`).
 *
 * - `oceanAxisUnits` (top-level) — a `{ dimensionName: unitString }` map used to
 *   label the X/Y/Z position readouts (e.g. `{ "x": "°E", "y": "°N", "z": "m" }`).
 *   Needed because Neuroglancer's coordinate-space units are SI-only and reject
 *   `"°"`. See `wrapper/units.ts` (`setAxisUnits`).
 */
export type ViewerStateJson = Record<string, unknown>;

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
export type OutboundMessage = ReportMessage | ClickMessage;

/** Full envelope as it travels over `postMessage`. */
export type Envelope<M extends { type: string }> = M & {
	source: typeof PROTOCOL_SOURCE;
};

export function isOceanEnvelope(
	data: unknown,
): data is Envelope<{ type: string }> {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { source?: unknown }).source === PROTOCOL_SOURCE &&
		typeof (data as { type?: unknown }).type === "string"
	);
}

export function isConfigMessage(
	data: Envelope<{ type: string }>,
): data is Envelope<ConfigMessage> {
	return (
		data.type === "CONFIG" &&
		typeof (data as { state?: unknown }).state === "object" &&
		(data as { state?: unknown }).state !== null
	);
}
