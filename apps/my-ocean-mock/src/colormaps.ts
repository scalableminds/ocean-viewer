import { COLORMAP_STOPS } from "@ocean-viewer/colormaps";
import type { ColormapId } from "@ocean-viewer/protocol";

export { COLORMAP_IDS } from "@ocean-viewer/colormaps";

/**
 * A `linear-gradient(...)` CSS value for the given colormap, used to paint the
 * swatches and colour bars in the mock UI.
 *
 * Colormaps are stored as piecewise-linear stops, which is exactly what a CSS
 * linear gradient interpolates — so a swatch shows the same colours the viewer's
 * shader renders, without the mock keeping its own approximation of each map.
 */
export function gradientCss(id: ColormapId, angle = "90deg"): string {
	const stops = COLORMAP_STOPS[id].map(
		([position, r, g, b]) =>
			`rgb(${r} ${g} ${b}) ${(position * 100).toFixed(2)}%`,
	);
	return `linear-gradient(${angle}, ${stops.join(", ")})`;
}
