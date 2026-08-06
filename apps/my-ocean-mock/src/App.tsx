import type {
	ClickMessage,
	HoverMessage,
	LayerValue,
	PointerSample,
} from "@ocean-viewer/protocol";
import { useRef, useState } from "react";
import { LayerCard } from "./LayerCard";
import { INITIAL_LAYERS } from "./layers";
import { toNeuroglancerUrl } from "./neuroglancerLink";
import { OceanViewerFrame, type OceanViewerHandle } from "./OceanViewerFrame";
import type { Layer } from "./types";

/**
 * Axis labels for a pointer sample's `world` array. The protocol sends bare
 * numbers in the state's `dimensions` order — which for this harness is the
 * fixed x / y / elevation space that `stateBuilder` pins on every CONFIG.
 */
const WORLD_AXES = ["x", "y", "elevation"];

function formatWorld(world: number[]): string {
	return world
		.map((v, i) => `${WORLD_AXES[i] ?? `d${i}`} ${v.toFixed(3)}`)
		.join(", ");
}

function formatValue(value: LayerValue["value"]): string {
	if (value === null) return "—";
	if (typeof value === "number") return value.toPrecision(6);
	if (Array.isArray(value))
		return value.map((v) => v.toPrecision(6)).join(", ");
	return value;
}

/** Position + per-layer values of one CLICK or HOVER. */
function PointerReadout({
	label,
	sample,
}: {
	label: string;
	sample: PointerSample;
}) {
	return (
		<div className="pointer-readout">
			<div className="pointer-position">
				<span className="pointer-label">{label}</span>
				{formatWorld(sample.world)}
			</div>
			{sample.layers.map((layer) => (
				<div key={layer.name} className="pointer-layer">
					<span>{layer.name}</span>
					<span className="pointer-value">{formatValue(layer.value)}</span>
				</div>
			))}
		</div>
	);
}

export function App() {
	const [layers, setLayers] = useState<Layer[]>(INITIAL_LAYERS);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [click, setClick] = useState<ClickMessage | null>(null);
	const [hover, setHover] = useState<HoverMessage | null>(null);
	const viewerRef = useRef<OceanViewerHandle>(null);

	const patchLayer = (id: string, patch: Partial<Layer>) => {
		setLayers((prev) =>
			prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
		);
	};

	// Open the state currently driving the embedded viewer in a stock
	// Neuroglancer, for comparing against a plain instance or sharing a link.
	const openInNeuroglancer = () => {
		const state = viewerRef.current?.getState();
		if (!state) return;
		window.open(toNeuroglancerUrl(state), "_blank", "noopener,noreferrer");
	};

	// Dump that same state to the console: the object for clicking through, and
	// pretty JSON for copy-pasting into a bug report or the protocol docs.
	const logState = () => {
		const state = viewerRef.current?.getState();
		if (!state) return;
		console.groupCollapsed("[my-ocean-mock] CONFIG state");
		console.log(state);
		console.log(JSON.stringify(state, null, 2));
		console.groupEnd();
	};

	return (
		<div className="app">
			<aside className="sidebar">
				<header className="sidebar-header">
					<button type="button" className="add-layer" tabIndex={-1}>
						<span className="plus">+</span> Add layer…
					</button>
				</header>

				<div className="layer-list">
					{layers.map((layer) => (
						<LayerCard
							key={layer.id}
							layer={layer}
							expanded={expandedId === layer.id}
							onToggleExpanded={() =>
								setExpandedId((cur) => (cur === layer.id ? null : layer.id))
							}
							onChange={(patch) => patchLayer(layer.id, patch)}
						/>
					))}
				</div>

				{(hover || click) && (
					<div className="pointer-readouts">
						{hover && <PointerReadout label="hover" sample={hover} />}
						{click && <PointerReadout label="click" sample={click} />}
					</div>
				)}

				<div className="dev-tools">
					<button type="button" onClick={openInNeuroglancer}>
						Open in Neuroglancer ↗
					</button>
					<button type="button" onClick={logState}>
						Log config
					</button>
				</div>
			</aside>

			<main className="viewer">
				<OceanViewerFrame
					ref={viewerRef}
					layers={layers}
					onClick={setClick}
					onHover={setHover}
				/>
			</main>
		</div>
	);
}
