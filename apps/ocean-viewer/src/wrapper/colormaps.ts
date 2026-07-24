/**
 * Colormap + value-rendering shader resolver for image layers.
 *
 * The Data Portal supplies a colormap either as:
 *   - a raw GLSL shader string  → used verbatim as the layer `shader`, or
 *   - a named identifier (e.g. "viridis") → resolved here to a generated GLSL
 *     shader that maps the data value through the colormap.
 *
 * On top of the colormap we support, per the spec:
 *   - logarithmic scaling   (`scale: "log"`)
 *   - value clamping        (`clamp: true`)
 *   - null / missing voxels rendered transparent (NaN, CMEMS fill, sentinel)
 *
 * Named colormaps are implemented as compact GLSL polynomial approximations
 * (Neuroglancer only ships `colormapJet`/`colormapCubehelix` natively, so
 * viridis/magma/plasma/inferno/turbo are provided here).
 */

import type {
	ColormapName,
	ColormapSpec,
	ViewerStateJson,
} from "../protocol.js";

export type { ColormapName, ColormapSpec };

/** GLSL `vec3 <name>(float t)` polynomial colormap definitions. */
const COLORMAP_GLSL: Record<ColormapName, string> = {
	grayscale: `vec3 cmap(float t){ return vec3(clamp(t,0.0,1.0)); }`,
	viridis: poly("cmap", [
		[0.2777273272234177, 0.005407344544966578, 0.3340998053353061],
		[0.1050930431085774, 1.404613529898575, 1.384590162594685],
		[-0.3308618287255563, 0.214847559468213, 0.09509516302823659],
		[-4.634230498983486, -5.799100973351585, -19.33244095627987],
		[6.228269936347081, 14.17993336680509, 56.69055260068105],
		[4.776384997670288, -13.74514537774601, -65.35303263337234],
		[-5.435455855934631, 4.645852612178535, 26.3124352495832],
	]),
	magma: poly("cmap", [
		[-0.002136485053939582, -0.000749655052795221, -0.005386127855323933],
		[0.2516605407371642, 0.6775232436837668, 2.494026599312351],
		[8.353717279216625, -3.577719514958484, 0.3144679030132573],
		[-27.66873308576866, 14.26473078096533, -13.64921318813922],
		[52.17613981234068, -27.94360607168351, 12.94416944238394],
		[-50.76852536473588, 29.04658282127291, 4.23415299384598],
		[18.65570506591883, -11.48977351997711, -5.601961508734096],
	]),
	plasma: poly("cmap", [
		[0.05873234392399702, 0.02333670892565664, 0.5433401826748754],
		[2.176514634195958, 0.2383834171260182, 0.7539604599784036],
		[-2.689460476458034, -7.455851135738909, 3.110799939717086],
		[6.130348345893603, 42.3461881477227, -28.51885465332158],
		[-11.10743619062271, -82.66631109428045, 60.13984767418263],
		[10.02306557647065, 71.41361770095349, -54.07218655560067],
		[-3.658713842777788, -22.93153465461149, 18.19190778539828],
	]),
	inferno: poly("cmap", [
		[0.0002189403691192265, 0.001651004631001012, -0.01948089843709184],
		[0.1065134194856116, 0.5639564367884091, 3.932712388889277],
		[11.60249308247187, -3.972853965665698, -15.9423941062914],
		[-41.70399613139459, 17.43639888205313, 44.35414519872813],
		[77.162935699427, -33.40235894210092, -81.80730925738993],
		[-71.31942824499214, 32.62606426397723, 73.20951985803202],
		[25.13112622477341, -12.24266895238567, -23.07032500287172],
	]),
	turbo: poly("cmap", [
		[0.13572138, 4.6153926, -42.66032258],
		[0.09140261, 2.19418839, 4.84296658],
		[0.1066733, -2.45580785, -10.81668594],
		[-0.0729655, 8.353717, 30.0],
		[0.0, 0.0, 0.0],
		[0.0, 0.0, 0.0],
		[0.0, 0.0, 0.0],
	]),
	jet: `vec3 cmap(float t){
    t = clamp(t, 0.0, 1.0);
    float r = clamp(1.5 - abs(4.0*t - 3.0), 0.0, 1.0);
    float g = clamp(1.5 - abs(4.0*t - 2.0), 0.0, 1.0);
    float b = clamp(1.5 - abs(4.0*t - 1.0), 0.0, 1.0);
    return vec3(r, g, b);
  }`,
};

/** True when the supplied colormap is a known named identifier. */
export function isNamedColormap(name: string): name is ColormapName {
	return Object.hasOwn(COLORMAP_GLSL, name);
}

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
	if (typeof spec.colormap === "string" && looksLikeGlsl(spec.colormap)) {
		return spec.colormap;
	}
	const name: ColormapName = isNamedColormap(spec.colormap)
		? spec.colormap
		: "viridis";
	const clamp = spec.clamp ?? true;
	const log = spec.scale === "log";

	// Normalisation expression mapping the raw value to [0,1].
	const norm = log
		? `float t = (log(value) - log(${glslFloat(spec.dataMin)})) / (log(${glslFloat(spec.dataMax)}) - log(${glslFloat(spec.dataMin)}));`
		: `float t = (value - ${glslFloat(spec.dataMin)}) / (${glslFloat(spec.dataMax)} - ${glslFloat(spec.dataMin)});`;

	// For log scale, non-positive values are undefined → treat as missing.
	const logGuard = log
		? `\n  if (value <= 0.0) { emitTransparent(); return; }`
		: "";
	const clampLine = clamp ? `\n  t = clamp(t, 0.0, 1.0);` : "";
	// Explicit no-data sentinel (e.g. CMEMS bathymetry's -32767) → transparent.
	const fillGuard =
		spec.noDataValue !== undefined
			? `\n  if (value == ${glslFloat(spec.noDataValue)}) { emitTransparent(); return; }`
			: "";

	// Missing voxels render transparent (not black) so lower layers and the page
	// background show through where a layer has no data (land, fill values).
	return `${COLORMAP_GLSL[name]}
void main() {
  float value = getDataValue();
  if (value != value) { emitTransparent(); return; }
  if (abs(value) > 1e30) { emitTransparent(); return; }${fillGuard}${logGuard}
  ${norm}${clampLine}
  emitRGB(cmap(t));
}`;
}

/**
 * Resolve any `oceanColormap` fields on a viewer state's image layers into
 * Neuroglancer `shader` strings.
 *
 * This is the integration point for the Data Portal's "named colormap"
 * interface: instead of hand-writing GLSL, a CONFIG layer may carry
 *   `"oceanColormap": { "colormap": "viridis", "dataMin": 10, "dataMax": 20,
 *                       "scale": "log", "clamp": true }`
 * which we convert to a `shader` (log scale, clamping and null→black included)
 * and strip, so the object handed to `restoreState` is standard Neuroglancer
 * state. Layers that already specify a raw `shader` are left untouched; the
 * `colormap` field may also itself be a raw GLSL string (passed through).
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

/** Build a `vec3 <name>(float t)` 6th-order polynomial colormap from RGB coeffs. */
function poly(
	name: string,
	c: ReadonlyArray<readonly [number, number, number]>,
): string {
	const v = (row: readonly [number, number, number]): string =>
		`vec3(${row.map(glslFloat).join(", ")})`;
	return `vec3 ${name}(float t){
    t = clamp(t, 0.0, 1.0);
    const vec3 c0 = ${v(c[0])};
    const vec3 c1 = ${v(c[1])};
    const vec3 c2 = ${v(c[2])};
    const vec3 c3 = ${v(c[3])};
    const vec3 c4 = ${v(c[4])};
    const vec3 c5 = ${v(c[5])};
    const vec3 c6 = ${v(c[6])};
    return clamp(c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6))))), 0.0, 1.0);
  }`;
}

/** Render a JS number as a GLSL float literal (always with a decimal point). */
function glslFloat(n: number): string {
	if (!Number.isFinite(n)) return "0.0";
	return Number.isInteger(n) ? `${n}.0` : String(n);
}
