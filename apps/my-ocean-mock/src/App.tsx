import { useRef, useState } from "react";
import { LayerCard } from "./LayerCard";
import { INITIAL_LAYERS } from "./layers";
import { toNeuroglancerUrl } from "./neuroglancerLink";
import { OceanViewerFrame, type OceanViewerHandle } from "./OceanViewerFrame";
import type { Layer } from "./types";

export function App() {
	const [layers, setLayers] = useState<Layer[]>(INITIAL_LAYERS);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [clickInfo, setClickInfo] = useState<string | null>(null);
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

				{clickInfo && <div className="click-readout">{clickInfo}</div>}

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
					onClick={(geo) =>
						setClickInfo(
							`lon ${geo.longitude.toFixed(3)}°, lat ${geo.latitude.toFixed(3)}°, depth ${geo.depth.toFixed(1)} m`,
						)
					}
				/>
			</main>
		</div>
	);
}
