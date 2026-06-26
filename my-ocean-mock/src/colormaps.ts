import type { ColormapName } from "./types";

/**
 * CSS gradient stops per colormap, used purely to render the swatches and the
 * colour bar in the mock UI. (The actual GLSL colormaps live in the viewer's
 * `wrapper/colormaps.ts`; these are visual approximations of the same maps.)
 */
export const COLORMAP_STOPS: Record<ColormapName, string[]> = {
	viridis: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
	magma: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
	plasma: ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"],
	inferno: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
	turbo: ["#30123b", "#4669f7", "#1ae4b6", "#a4fc3c", "#fb7e21", "#7a0403"],
	jet: ["#00007f", "#0000ff", "#00ffff", "#ffff00", "#ff0000", "#7f0000"],
	grayscale: ["#000000", "#404040", "#808080", "#c0c0c0", "#ffffff"],
};

export const COLORMAP_NAMES = Object.keys(COLORMAP_STOPS) as ColormapName[];

/** A `linear-gradient(...)` CSS value for the given colormap. */
export function gradientCss(name: ColormapName, angle = "90deg"): string {
	return `linear-gradient(${angle}, ${COLORMAP_STOPS[name].join(", ")})`;
}
