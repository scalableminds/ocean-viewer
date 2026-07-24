import { COLORMAP_NAMES, gradientCss } from "./colormaps";
import type { ColormapName, Layer } from "./types";

interface Props {
	layer: Layer;
	expanded: boolean;
	onToggleExpanded: () => void;
	onChange: (patch: Partial<Layer>) => void;
}

/** Inline SVG icons (24px viewBox), stroked with currentColor. */
const Icon = {
	eyeOpen: (
		<svg
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	),
	eyeClosed: (
		<svg
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
		</svg>
	),
	download: (
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
		</svg>
	),
	info: (
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4M12 8h.01" />
		</svg>
	),
	stack: (
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
		</svg>
	),
	gear: (
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
		</svg>
	),
};

/** Colour bar with min/max/unit ticks, reflecting the active colormap. */
function ColorBar({ layer }: { layer: Layer }) {
	const mid =
		layer.scale === "log" ? "" : ((layer.min + layer.max) / 2).toString();
	return (
		<div className="colorbar">
			<div
				className="colorbar-gradient"
				style={{ background: gradientCss(layer.colormap) }}
			/>
			<div className="colorbar-ticks">
				<span>{formatNum(layer.min)}</span>
				{mid && <span>{formatNum((layer.min + layer.max) / 2)}</span>}
				<span>
					{formatNum(layer.max)} {layer.unit}
				</span>
			</div>
		</div>
	);
}

export function LayerCard({
	layer,
	expanded,
	onToggleExpanded,
	onChange,
}: Props) {
	return (
		<div className={`layer-card${layer.visible ? "" : " is-hidden"}`}>
			<div className="layer-head">
				<button
					type="button"
					className={`eye${layer.visible ? " on" : ""}`}
					title={layer.visible ? "Hide layer" : "Show layer"}
					onClick={() => onChange({ visible: !layer.visible })}
				>
					{layer.visible ? Icon.eyeOpen : Icon.eyeClosed}
				</button>
				<div className="layer-titles">
					<div className="layer-title">
						{layer.title} <span className="layer-short">{layer.shortName}</span>
					</div>
					<div className="layer-subtitle">{layer.subtitle}</div>
				</div>
			</div>

			<ColorBar layer={layer} />

			<div className="layer-actions">
				<button type="button" className="action" title="Download" tabIndex={-1}>
					{Icon.download}
				</button>
				<button type="button" className="action" title="Info" tabIndex={-1}>
					{Icon.info}
				</button>
				<button
					type="button"
					className="action"
					title="Layer order"
					tabIndex={-1}
				>
					{Icon.stack}
				</button>
				<button
					type="button"
					className={`action${expanded ? " active" : ""}`}
					title="Settings"
					onClick={onToggleExpanded}
				>
					{Icon.gear}
				</button>
				<button
					type="button"
					className={`action log${layer.scale === "log" ? " active" : ""}`}
					title="Toggle logarithmic scale"
					onClick={() =>
						onChange({ scale: layer.scale === "log" ? "linear" : "log" })
					}
				>
					log
				</button>
			</div>

			{expanded && (
				<div className="layer-settings">
					<div className="setting-row">
						<label htmlFor={`op-${layer.id}`}>Opacity</label>
						<input
							id={`op-${layer.id}`}
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={layer.opacity}
							onChange={(e) => onChange({ opacity: Number(e.target.value) })}
						/>
					</div>

					<div className="setting-row colmap-row">
						<span className="setting-label">Colour map</span>
						<div className="colmap-grid">
							{COLORMAP_NAMES.map((name) => (
								<button
									key={name}
									type="button"
									title={name}
									className={`swatch${layer.colormap === name ? " selected" : ""}`}
									style={{ background: gradientCss(name) }}
									onClick={() => onChange({ colormap: name as ColormapName })}
								/>
							))}
						</div>
					</div>

					<div className="setting-row minmax-row">
						<label>
							Min:
							<input
								type="number"
								value={layer.min}
								onChange={(e) => onChange({ min: Number(e.target.value) })}
							/>
						</label>
						<label>
							Max:
							<input
								type="number"
								value={layer.max}
								onChange={(e) => onChange({ max: Number(e.target.value) })}
							/>
						</label>
					</div>
				</div>
			)}
		</div>
	);
}

function formatNum(n: number): string {
	if (Math.abs(n) >= 1000) return n.toLocaleString("en-US");
	// Trim trailing zeros for small decimals.
	return String(Number(n.toFixed(3)));
}
