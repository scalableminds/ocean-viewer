import { useCallback, useEffect, useRef } from "react";
import {
	buildFullState,
	type ConfigMessage,
	PROTOCOL_SOURCE,
	type ViewerStateJson,
} from "./protocol";
import type { Layer } from "./types";

/** Ocean Viewer dev-server URL. Override via VITE_VIEWER_URL. */
const VIEWER_URL = import.meta.env.VITE_VIEWER_URL ?? "http://localhost:5174/";

/**
 * Camera fields carried over from the viewer's own REPORTs so layer edits don't
 * reset the user's pan/zoom. Safe to reuse verbatim because we always send a
 * full state with our fixed `dimensions`, so the viewer's coordinate-space order
 * matches the order these arrays are expressed in.
 */
const CAMERA_KEYS = [
	"position",
	"projectionOrientation",
	"projectionScale",
	"projectionDepth",
	"crossSectionOrientation",
	"crossSectionScale",
	"crossSectionDepth",
] as const;

interface Props {
	layers: Layer[];
	/** Called with the geographic coordinate of a click in the viewer. */
	onClick?: (geo: {
		longitude: number;
		latitude: number;
		depth: number;
	}) => void;
}

/**
 * Embeds the Ocean Viewer iframe and keeps it in sync with the layer list.
 *
 * Every update is sent as a `full` CONFIG. A partial (`layers`-only) update
 * can't be used here: the layers span different dimensions (deptho is 2-D,
 * thetao/chl are 4-D), so Neuroglancer re-derives the global dimension ORDER
 * from whichever layers are visible. A full state pins `dimensions` and
 * `position` together so the axes never scramble. To still preserve the user's
 * camera across edits, we cache the camera from inbound REPORTs and graft it
 * onto the full state we send.
 */
export function OceanViewerFrame({ layers, onClick }: Props) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const readyRef = useRef(false);
	// Latest camera reported by the viewer after user interaction (pan/zoom).
	const cameraRef = useRef<ViewerStateJson | null>(null);
	// Always read the latest layers when (re)sending without re-binding handlers.
	const layersRef = useRef(layers);
	layersRef.current = layers;

	// Stable identity (only reads refs) so the effect below can list it as a
	// dependency without re-firing on every render.
	const post = useCallback((message: Omit<ConfigMessage, "source">) => {
		const win = iframeRef.current?.contentWindow;
		if (!win) return;
		win.postMessage({ source: PROTOCOL_SOURCE, ...message }, "*");
	}, []);

	// Full state for the current layers, with the user's last camera grafted on.
	// Stable identity (only reads refs/module constants), same reason as `post`.
	const composeState = useCallback((layerList: Layer[]): ViewerStateJson => {
		const state = buildFullState(layerList);
		const camera = cameraRef.current;
		if (camera) {
			for (const key of CAMERA_KEYS) {
				if (key in camera) state[key] = camera[key];
			}
		}
		return state;
	}, []);

	// Send the initial state once the iframe document has loaded. A short delay
	// lets the viewer's bootstrap attach its postMessage bridge before we send.
	const handleLoad = () => {
		readyRef.current = false;
		cameraRef.current = null;
		window.setTimeout(() => {
			post({
				type: "CONFIG",
				state: composeState(layersRef.current),
				mode: "full",
			});
			readyRef.current = true;
		}, 250);
	};

	// Re-send a full state whenever the layers change.
	useEffect(() => {
		if (!readyRef.current) return;
		post({ type: "CONFIG", state: composeState(layers), mode: "full" });
	}, [layers, composeState, post]);

	// Surface REPORT/CLICK messages coming back from the viewer.
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data;
			if (!data || data.source !== PROTOCOL_SOURCE) return;
			if (data.type === "REPORT" && data.state) {
				cameraRef.current = data.state as ViewerStateJson;
			} else if (data.type === "CLICK" && data.geographic) {
				onClick?.(data.geographic);
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [onClick]);

	return (
		<iframe
			ref={iframeRef}
			className="viewer-frame"
			src={VIEWER_URL}
			title="Ocean Viewer"
			onLoad={handleLoad}
		/>
	);
}
