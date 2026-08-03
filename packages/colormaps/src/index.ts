/**
 * Colour data for the named colormaps of the Ocean Viewer protocol.
 *
 * The protocol identifies a colormap by id (`@ocean-viewer/protocol`'s
 * {@link ColormapId}); this package is the single source of truth for what each
 * of those ids actually looks like. Both sides of the iframe need that: the
 * viewer compiles the stops into the GLSL of an image layer's shader, and the
 * portal paints the same stops into swatches and colour bars, so a layer's
 * legend matches what is drawn on the map.
 *
 * Colormaps are stored as piecewise-linear {@link ColormapStop} lists rather
 * than as dense 256-entry lookup tables — see `tools/generate-stops.mjs`, which
 * derives them from the reference tables.
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
