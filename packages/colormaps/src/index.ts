/**
 * Colour data for the named colormaps of the Ocean Viewer protocol.
 *
 * Single source of truth for what each `@ocean-viewer/protocol` {@link ColormapId}
 * looks like: the viewer compiles stops into shader GLSL, and the portal
 * paints the same stops into swatches and colour bars.
 *
 * Stored as piecewise-linear {@link ColormapStop} lists rather than dense
 * 256-entry lookup tables — see `tools/generate-stops.mjs`.
 */

import type { ColormapId } from "@ocean-viewer/protocol";
import { COLORMAP_STOPS } from "./stops";

export type { ColormapStop } from "./types";
export { COLORMAP_STOPS };

/** Every colormap id, in the order colormaps should be offered to the user. */
export const COLORMAP_IDS = Object.keys(COLORMAP_STOPS) as ColormapId[];

/** True when `id` names a colormap this package has colour data for. */
export function isColormapId(id: string): id is ColormapId {
	return Object.hasOwn(COLORMAP_STOPS, id);
}
