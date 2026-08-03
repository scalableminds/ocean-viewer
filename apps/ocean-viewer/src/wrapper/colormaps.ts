/**
 * Colormap + value-rendering shader resolver for image layers.
 *
 * The Data Portal supplies a colormap either as:
 *   - a raw GLSL shader string  → used verbatim as the layer `shader`, or
 *   - a colormap id (e.g. "viridis") → resolved here to a generated GLSL
 *     shader that maps the data value through the colormap.
 *
 * On top of the colormap we support, per the spec:
 *   - logarithmic scaling   (`logScale: true`)
 *   - value clamping        (`valueClamp: true`)
 *   - reversed colormaps    (`colormapInvert: true`)
 *   - null / missing voxels rendered transparent (NaN, CMEMS fill, sentinel)
 *
 * Neuroglancer only ships `colormapJet`/`colormapCubehelix` natively, so every
 * colormap the protocol names is compiled into the shader here, from the stop
 * lists in `@ocean-viewer/colormaps`.
 */

import { COLORMAP_STOPS, isColormapId } from "@ocean-viewer/colormaps";
import type {
	ColormapId,
	ColormapSpec,
	ViewerStateJson,
} from "@ocean-viewer/protocol";

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

	// Missing voxels render transparent (not black) so lower layers and the page
	// background show through where a layer has no data (land, fill values).
	return `${colormapGlsl(id)}
void main() {
  float value = getDataValue();
  if (value != value) { emitTransparent(); return; }
  if (abs(value) > 1e30) { emitTransparent(); return; }${fillGuard}${logGuard}
  ${norm}${clampLine}${invertLine}
  emitRGB(cmap(t));
}`;
}

/**
 * Resolve any `oceanColormap` fields on a viewer state's image layers into
 * Neuroglancer `shader` strings.
 *
 * This is the integration point for the Data Portal's "colormap by id"
 * interface: instead of hand-writing GLSL, a CONFIG layer may carry
 *   `"oceanColormap": { "colormapId": "viridis", "valueMin": 10, "valueMax": 20,
 *                       "logScale": true, "valueClamp": true }`
 * which we convert to a `shader` (log scale, clamping and null→transparent included)
 * and strip, so the object handed to `restoreState` is standard Neuroglancer
 * state. Layers that already specify a raw `shader` are left untouched; the
 * `colormapId` field may also itself be a raw GLSL string (passed through).
 */
export function resolveStateColormaps(state: ViewerStateJson): ViewerStateJson {
	const layers = state.layers;
	if (!Array.isArray(layers)) {
		return state;
	}
	const resolved = layers.map((layer) => {
		if (
			layer === null ||
			typeof layer !== "object" ||
			!("oceanColormap" in layer)
		) {
			return layer;
		}
		const { oceanColormap, ...rest } = layer as Record<string, unknown>;
		return { ...rest, shader: resolveShader(oceanColormap as ColormapSpec) };
	});
	return { ...state, layers: resolved };
}

/**
 * Compile a colormap into a GLSL `vec3 cmap(float t)` function.
 *
 * The stops are emitted as a `vec4` table of `(position, r, g, b)` and looked up
 * by walking to the first stop at or past `t`, then interpolating within that
 * segment — the same piecewise-linear reconstruction the stop lists are fitted
 * for, so the shader reproduces the reference colormap to within 1/255.
 *
 * Positions are strictly increasing (they come from distinct lookup-table
 * indices), so the `hi.x - lo.x` divisor is never zero.
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
