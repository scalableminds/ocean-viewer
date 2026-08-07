/**
 * An image layer that reports values in physical units.
 *
 * A layer's `oceanColormap` carries the CF packing (`scaleFactor`/`addOffset`)
 * and no-data sentinel that the shader applies to render correctly — but
 * Neuroglancer picks values straight from the chunk, so every readout built on
 * that pick (hover value, selection panel, CLICK/HOVER) shows the raw stored
 * integer instead: a CMEMS int16 temperature reads as `-9243` instead of
 * `14.23 °C`.
 *
 * Overriding `transformPickedValue` — Neuroglancer's hook for exactly this —
 * fixes every readout at once. Not covered: the invlerp/shader-control ranges
 * and histogram, which Neuroglancer computes from the texture data directly.
 *
 * The spec is read from the layer JSON and re-emitted by `toJSON`, so a layer
 * rebuilt from a REPORT round-trip keeps reporting physical units.
 */

import { physicalValue } from "@ocean-viewer/colormaps/shader";
import type { ColormapSpec } from "@ocean-viewer/protocol";
import { ImageUserLayer } from "neuroglancer/unstable/layer/image/index.js";
import {
	registerLayerType,
	registerVolumeLayerType,
} from "neuroglancer/unstable/layer/index.js";
import { VolumeType } from "neuroglancer/unstable/sliceview/volume/base.js";

/** Layer-JSON key holding the Data Portal's colormap + value-packing spec. */
const OCEAN_COLORMAP_JSON_KEY = "oceanColormap";

export class OceanImageUserLayer extends ImageUserLayer {
	private oceanColormap: ColormapSpec | undefined;

	override restoreState(specification: unknown): void {
		super.restoreState(specification);
		this.oceanColormap = readColormapSpec(specification);
	}

	override toJSON(): Record<string, unknown> {
		const json = super.toJSON() as Record<string, unknown>;
		if (this.oceanColormap !== undefined) {
			json[OCEAN_COLORMAP_JSON_KEY] = this.oceanColormap;
		}
		return json;
	}

	/**
	 * Values arrive one per channel when the layer has channel dimensions, and as
	 * a `bigint` for 64-bit integer sources — hence the array branch and the
	 * `number | bigint` handling in {@link toPhysical}.
	 */
	override transformPickedValue(value: unknown): unknown {
		const spec = this.oceanColormap;
		if (spec === undefined || value === undefined || value === null) {
			return value;
		}
		return Array.isArray(value)
			? value.map((channel: unknown) => toPhysical(spec, channel))
			: toPhysical(spec, value);
	}
}

/**
 * Use {@link OceanImageUserLayer} wherever Neuroglancer would use its own image
 * layer. Must run after `main_module.js` has registered the stock one.
 *
 * Registers by name (for a layer stating `"type": "image"`) and by volume type
 * (for one left to auto-detection), mirroring Neuroglancer's own registration.
 */
export function registerOceanImageLayer(): void {
	registerLayerType(OceanImageUserLayer);
	registerVolumeLayerType(VolumeType.IMAGE, OceanImageUserLayer);
}

/** One channel's value in physical units; non-numeric values pass through. */
function toPhysical(spec: ColormapSpec, value: unknown): unknown {
	return typeof value === "number" || typeof value === "bigint"
		? physicalValue(spec, value)
		: value;
}

/** The `oceanColormap` of a layer specification, if it carries a usable one. */
function readColormapSpec(specification: unknown): ColormapSpec | undefined {
	if (typeof specification !== "object" || specification === null) {
		return undefined;
	}
	const spec = (specification as Record<string, unknown>)[
		OCEAN_COLORMAP_JSON_KEY
	];
	return typeof spec === "object" && spec !== null
		? (spec as ColormapSpec)
		: undefined;
}
