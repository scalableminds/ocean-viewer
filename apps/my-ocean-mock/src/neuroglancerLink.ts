/**
 * Turns the CONFIG state the mock sends over postMessage into a URL for a
 * stock Neuroglancer instance, so the exact same state can be opened, poked at
 * and shared outside the embedded viewer.
 *
 * The state has to be de-Ocean-ified first: `oceanAxisUnits` and each layer's
 * `oceanColormap` are extensions of ours that a stock instance would ignore, so
 * we apply them the same way the viewer's wrapper does — units are dropped
 * (there is no equivalent), colormaps are compiled into the layer `shader`.
 */

import { resolveStateColormaps } from "@ocean-viewer/colormaps/shader";
import type { ViewerStateJson } from "@ocean-viewer/protocol";

/** Stock Neuroglancer instance to hand the state to. Override via env. */
const NEUROGLANCER_URL =
	import.meta.env.VITE_NEUROGLANCER_URL ??
	"https://neuroglancer-demo.appspot.com/";

/** `#!`-encoded Neuroglancer URL for `state`. */
export function toNeuroglancerUrl(state: ViewerStateJson): string {
	const { oceanAxisUnits: _dropped, ...rest } = state;
	const json = JSON.stringify(resolveStateColormaps(rest));
	return `${NEUROGLANCER_URL}#!${encodeURIComponent(json)}`;
}
