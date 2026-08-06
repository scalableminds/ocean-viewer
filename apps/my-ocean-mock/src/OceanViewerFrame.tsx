import {
	type ClickMessage,
	type ConfigMessage,
	type HoverMessage,
	PROTOCOL_NAMESPACE,
	type ViewerStateJson,
} from "@ocean-viewer/protocol";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { buildFullState } from "./stateBuilder";
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

/** Imperative access to the state the frame would send right now. */
export interface OceanViewerHandle {
	/** The full CONFIG state for the current layers, camera included. */
	getState(): ViewerStateJson;
}

interface Props {
	layers: Layer[];
	/** Called with each CLICK the viewer reports (position + per-layer values). */
	onClick?: (click: ClickMessage) => void;
	/** Called with each (throttled) HOVER the viewer reports. */
	onHover?: (hover: HoverMessage) => void;
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
export const OceanViewerFrame = forwardRef<OceanViewerHandle, Props>(
	function OceanViewerFrame({ layers, onClick, onHover }, ref) {
		const iframeRef = useRef<HTMLIFrameElement>(null);
		const readyRef = useRef(false);
		// Latest camera reported by the viewer after user interaction (pan/zoom).
		const cameraRef = useRef<ViewerStateJson | null>(null);
		// Always read the latest layers when (re)sending without re-binding handlers.
		const layersRef = useRef(layers);
		layersRef.current = layers;

		// Stable identity (only reads refs) so the effect below can list it as a
		// dependency without re-firing on every render.
		const post = useCallback((message: Omit<ConfigMessage, "namespace">) => {
			const win = iframeRef.current?.contentWindow;
			if (!win) return;
			win.postMessage({ namespace: PROTOCOL_NAMESPACE, ...message }, "*");
		}, []);

		// Full state for the current layers, with the user's last camera grafted on.
		// Stable identity (only reads refs/module constants), same reason as `post`.
		const composeState = useCallback((layerList: Layer[]): ViewerStateJson => {
			const state = buildFullState(layerList) as Record<string, unknown>;
			const camera = cameraRef.current as Record<string, unknown> | null;
			if (camera) {
				for (const key of CAMERA_KEYS) {
					if (key in camera) state[key] = camera[key];
				}
			}
			return state as ViewerStateJson;
		}, []);

		// Let the parent read that same state (for the debug buttons) without having
		// to duplicate the camera bookkeeping.
		useImperativeHandle(
			ref,
			() => ({ getState: () => composeState(layersRef.current) }),
			[composeState],
		);

		// Sending the initial state is driven by the viewer's READY message (see the
		// message listener below), not by a timer: the iframe's `load` event fires
		// before the viewer's bootstrap has attached its bridge, so a CONFIG sent
		// there would be dropped. `load` only resets the per-document state, since a
		// reload means a fresh viewer that will announce itself again.
		const handleLoad = () => {
			readyRef.current = false;
			cameraRef.current = null;
		};

		// Re-send a full state whenever the layers change.
		useEffect(() => {
			if (!readyRef.current) return;
			post({ type: "CONFIG", state: composeState(layers), mode: "full" });
		}, [layers, composeState, post]);

		// Surface READY/REPORT/CLICK/HOVER messages coming back from the viewer.
		useEffect(() => {
			const onMessage = (event: MessageEvent) => {
				const data = event.data;
				if (!data || data.namespace !== PROTOCOL_NAMESPACE) return;
				if (data.type === "READY") {
					readyRef.current = true;
					post({
						type: "CONFIG",
						state: composeState(layersRef.current),
						mode: "full",
					});
				} else if (data.type === "REPORT" && data.state) {
					cameraRef.current = data.state as ViewerStateJson;
				} else if (data.type === "CLICK") {
					onClick?.(data as ClickMessage);
				} else if (data.type === "HOVER") {
					onHover?.(data as HoverMessage);
				}
			};
			window.addEventListener("message", onMessage);
			return () => window.removeEventListener("message", onMessage);
		}, [onClick, onHover, post, composeState]);

		return (
			<iframe
				ref={iframeRef}
				className="viewer-frame"
				src={VIEWER_URL}
				title="Ocean Viewer"
				onLoad={handleLoad}
			/>
		);
	},
);
