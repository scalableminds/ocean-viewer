/**
 * Turns the CONFIG state the mock sends over postMessage into a URL for a
 * stock Neuroglancer instance, so the exact same state can be opened, poked at
 * and shared outside the embedded viewer.
 *
 * The state has to be de-Ocean-ified first: each layer's `oceanColormap` is
 * compiled into the layer `shader`, then stripped — a stock instance has no use
 * for it once the shader exists. `oceanZoomDamping` is dropped too — stock
 * Neuroglancer has no damping, only the static `relativeDisplayScales`.
 */

import {
	resolveStateColormaps,
	stripOceanColormaps,
} from "@ocean-viewer/colormaps/shader";
import type { ViewerStateJson } from "@ocean-viewer/protocol";

/** Stock Neuroglancer instance to hand the state to. Override via env. */
const NEUROGLANCER_URL =
	import.meta.env.VITE_NEUROGLANCER_URL ??
	"https://neuroglancer-demo.appspot.com/";

/** `#!`-encoded Neuroglancer URL for `state`. */
export function toNeuroglancerUrl(state: ViewerStateJson): string {
	const { oceanZoomDamping: _dropped, ...plain } = state;
	const json = JSON.stringify(
		stripOceanColormaps(resolveStateColormaps(plain)),
	);
	return `${NEUROGLANCER_URL}#!${encodeURIComponent(json)}`;
}
