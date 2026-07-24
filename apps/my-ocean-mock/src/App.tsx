import { useState } from "react";
import { LayerCard } from "./LayerCard";
import { INITIAL_LAYERS } from "./layers";
import { OceanViewerFrame } from "./OceanViewerFrame";
import type { Layer } from "./types";

export function App() {
	const [layers, setLayers] = useState<Layer[]>(INITIAL_LAYERS);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [clickInfo, setClickInfo] = useState<string | null>(null);

	const patchLayer = (id: string, patch: Partial<Layer>) => {
		setLayers((prev) =>
			prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
		);
	};

	return (
		<div className="app">
			<aside className="sidebar">
				<header className="sidebar-header">
					<button type="button" className="add-layer" tabIndex={-1}>
						<span className="plus">+</span> Add layer…
					</button>
					<div className="header-icons">
						<span title="Feedback">💬</span>
						<span title="Share">🔗</span>
						<span title="Upload">⬆️</span>
						<span title="Info">ⓘ</span>
					</div>
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
			</aside>

			<main className="viewer">
				<OceanViewerFrame
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
