/**
 * Colormap + value-rendering shader resolver for image layers.
 *
 * A `ColormapSpec` is either a raw GLSL shader string (used verbatim) or a
 * colormap id (e.g. "viridis"), resolved here into a generated GLSL shader
 * from this package's stop lists, supporting logarithmic scaling, value
 * clamping, inversion, and transparent missing voxels (NaN, CMEMS fill,
 * sentinel).
 *
 * The spec also carries the CF packing (`scaleFactor`/`addOffset`) and the
 * no-data sentinel, describing what a stored number *means* rather than how
 * it's coloured. {@link physicalValue} applies them in JS for value readouts,
 * mirroring what {@link resolveShader} compiles into GLSL.
 *
 * Lives here rather than in the viewer so the portal side (the mock's "open
 * in Neuroglancer") can produce the same standard-Neuroglancer state.
 */

import type {
	ColormapId,
	ColormapSpec,
	ViewerStateJson,
} from "@ocean-viewer/protocol";
import { COLORMAP_STOPS, isColormapId } from "./index";

export type { ColormapId, ColormapSpec };

/** Colormap used when a spec names one we have no colour data for. */
const FALLBACK_COLORMAP: ColormapId = "viridis";

/** Heuristic: a raw GLSL shader string contains a `void main(` definition. */
function looksLikeGlsl(s: string): boolean {
	return /\bvoid\s+main\s*\(/.test(s);
}

/**
 * Resolve a {@link ColormapSpec} to a complete GLSL shader string suitable for
 * a Neuroglancer image layer's `shader` field.
 */
export function resolveShader(spec: ColormapSpec): string {
	// Raw GLSL passthrough.
	if (typeof spec.colormapId === "string" && looksLikeGlsl(spec.colormapId)) {
		return spec.colormapId;
	}
	const id: ColormapId = isColormapId(spec.colormapId)
		? spec.colormapId
		: FALLBACK_COLORMAP;
	const clamp = spec.valueClamp ?? false;
	const log = spec.logScale === true;
	const invert = spec.colormapInvert === true;

	// Normalisation expression mapping the raw value to [0,1].
	const norm = log
		? `float t = (log(value) - log(${glslFloat(spec.valueMin)})) / (log(${glslFloat(spec.valueMax)}) - log(${glslFloat(spec.valueMin)}));`
		: `float t = (value - ${glslFloat(spec.valueMin)}) / (${glslFloat(spec.valueMax)} - ${glslFloat(spec.valueMin)});`;

	// For log scale, non-positive values are undefined → treat as missing.
	const logGuard = log
		? `\n  if (value <= 0.0) { emitTransparent(); return; }`
		: "";
	const clampLine = clamp ? `\n  t = clamp(t, 0.0, 1.0);` : "";
	const invertLine = invert ? `\n  t = 1.0 - t;` : "";
	// Explicit no-data sentinel (e.g. CMEMS bathymetry's -32767) → transparent.
	const fillGuard =
		spec.noDataValue !== undefined
			? `\n  if (value == ${glslFloat(spec.noDataValue)}) { emitTransparent(); return; }`
			: "";
	// CF packing: Neuroglancer hands the shader the RAW stored integer, so undo
	// `scale_factor`/`add_offset` after the missing-data guards (specified
	// against the raw value) and before normalisation (which needs physical units).
	const { scale, offset } = packing(spec);
	const unpackLine =
		scale !== 1 || offset !== 0
			? `\n  value = value * ${glslFloat(scale)} + ${glslFloat(offset)};`
			: "";

	// Missing voxels render transparent (not black) so lower layers and the page
	// background show through where a layer has no data (land, fill values).
	//
	// `toRaw()` unwraps `getDataValue()`'s typed-struct result (Neuroglancer
	// wraps integer sources like CMEMS's int16 arrays) to a plain number; it's
	// the identity on float. Without it, the shader fails to compile for
	// integer sources and Neuroglancer falls back to its default grayscale one.
	return `${colormapGlsl(id)}
void main() {
  float value = float(toRaw(getDataValue()));
  if (value != value) { emitTransparent(); return; }
  if (abs(value) > 1e30) { emitTransparent(); return; }${fillGuard}${unpackLine}${logGuard}
  ${norm}${clampLine}${invertLine}
  emitRGB(cmap(t));
}`;
}

/**
 * The spec's CF packing, defaulted to the identity.
 *
 * Shared by the GLSL {@link resolveShader} emits and the JS {@link physicalValue}
 * applies, so the colours on screen and the numbers the UI reads out cannot
 * drift apart.
 */
function packing(spec: ColormapSpec): { scale: number; offset: number } {
	return { scale: spec.scaleFactor ?? 1, offset: spec.addOffset ?? 0 };
}

/**
 * Magnitude above which a stored value is missing rather than measured — the
 * CMEMS default fill (~9.969e36). Mirrors the shader's `abs(value) > 1e30` guard.
 */
const MISSING_MAGNITUDE = 1e30;

/**
 * What a RAW stored value means in physical units, per `spec`, or `undefined`
 * where the layer has no data (NaN, the CMEMS fill, or the `noDataValue`
 * sentinel) — `undefined` since that's what Neuroglancer renders as an empty
 * readout cell.
 *
 * The readout counterpart of the unpacking {@link resolveShader} compiles into
 * GLSL, with guards applied in the same order so a voxel that renders
 * transparent has no readout either (a sentinel wouldn't unpack to a
 * plausible-looking value instead of "no data").
 *
 * A spec that declares neither packing nor a sentinel hands the value straight
 * back — including `bigint`, so 64-bit integer layers keep an exact readout.
 */
export function physicalValue(
	spec: ColormapSpec,
	raw: number | bigint,
): number | bigint | undefined {
	const { scale, offset } = packing(spec);
	const { noDataValue } = spec;
	if (scale === 1 && offset === 0 && noDataValue === undefined) {
		return raw;
	}
	const value = Number(raw);
	if (!Number.isFinite(value) || Math.abs(value) > MISSING_MAGNITUDE) {
		return undefined;
	}
	if (value === noDataValue) {
		return undefined;
	}
	return value * scale + offset;
}

/**
 * Resolve any `oceanColormap` fields on a viewer state's image layers into
 * Neuroglancer `shader` strings.
 *
 * The integration point for the Data Portal's "colormap by id" interface:
 * instead of hand-writing GLSL, a CONFIG layer may carry an `oceanColormap`
 * spec that gets converted to a `shader`.
 *
 * The spec is kept on the layer rather than stripped: besides colouring, it
 * declares what a stored value means, which the viewer's image layer needs to
 * report physical values (see {@link physicalValue}). Neuroglancer ignores
 * layer keys it doesn't know, so the state stays safe to hand to
 * `restoreState`; use {@link stripOceanColormaps} for a state that must carry
 * nothing of ours.
 */
export function resolveStateColormaps(state: ViewerStateJson): ViewerStateJson {
	return mapOceanColormapLayers(state, (layer, oceanColormap) => ({
		...layer,
		shader: resolveShader(oceanColormap),
	}));
}

/**
 * Drop every layer's `oceanColormap`, leaving plain Neuroglancer state.
 *
 * For handing a state to a stock instance, which has no use for the field once
 * {@link resolveStateColormaps} has compiled it into the layer `shader`.
 */
export function stripOceanColormaps(state: ViewerStateJson): ViewerStateJson {
	return mapOceanColormapLayers(state, (layer) => {
		const { oceanColormap: _dropped, ...rest } = layer;
		return rest;
	});
}

/** Apply `transform` to each layer carrying an `oceanColormap`. */
function mapOceanColormapLayers(
	state: ViewerStateJson,
	transform: (
		layer: Record<string, unknown>,
		oceanColormap: ColormapSpec,
	) => Record<string, unknown>,
): ViewerStateJson {
	const layers = state.layers;
	if (!Array.isArray(layers)) {
		return state;
	}
	const mapped = layers.map((layer) => {
		if (
			layer === null ||
			typeof layer !== "object" ||
			!("oceanColormap" in layer)
		) {
			return layer;
		}
		const record = layer as Record<string, unknown>;
		return transform(record, record.oceanColormap as ColormapSpec);
	});
	return { ...state, layers: mapped };
}

/**
 * Compile a colormap into a GLSL `vec3 cmap(float t)` function.
 *
 * Stops are emitted as a `vec4` table of `(position, r, g, b)`, looked up by
 * walking to the first stop at or past `t` and interpolating within that
 * segment. Positions are strictly increasing, so `hi.x - lo.x` is never zero.
 */
function colormapGlsl(id: ColormapId): string {
	const stops = COLORMAP_STOPS[id];
	const n = stops.length;
	const table = stops
		.map(
			([position, r, g, b]) =>
				`  vec4(${glslFloat(position)}, ${[r, g, b].map(glslChannel).join(", ")})`,
		)
		.join(",\n");
	return `const vec4 cmapStops[${n}] = vec4[${n}](
${table}
);
vec3 cmap(float t) {
  t = clamp(t, 0.0, 1.0);
  for (int i = 1; i < ${n}; ++i) {
    vec4 hi = cmapStops[i];
    if (t <= hi.x) {
      vec4 lo = cmapStops[i - 1];
      return mix(lo.yzw, hi.yzw, (t - lo.x) / (hi.x - lo.x));
    }
  }
  return cmapStops[${n - 1}].yzw;
}`;
}

/** Render an 8-bit colour channel as a normalised GLSL float literal. */
function glslChannel(value: number): string {
	return glslFloat(Number((value / 255).toFixed(4)));
}

/** Render a JS number as a GLSL float literal (always with a decimal point). */
function glslFloat(n: number): string {
	if (!Number.isFinite(n)) return "0.0";
	return Number.isInteger(n) ? `${n}.0` : String(n);
}
