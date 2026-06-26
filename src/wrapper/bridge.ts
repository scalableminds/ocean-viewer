/**
 * postMessage bridge between the Ocean Viewer iframe and its parent (MyOcean).
 *
 * Inbound traffic is restricted to a configured parent origin. The origin can
 * be supplied at build time via `VITE_PARENT_ORIGIN`; otherwise the bridge
 * locks onto the origin of the first valid CONFIG it receives (handshake) and
 * rejects every other origin thereafter. Outbound messages are always targeted
 * at the locked origin, never `*`.
 */

import {
	type ConfigMessage,
	type Envelope,
	isConfigMessage,
	isOceanEnvelope,
	type OutboundMessage,
	PROTOCOL_SOURCE,
} from "../protocol.js";

export interface BridgeOptions {
	/** Allowed parent origin. If omitted, locks onto the first valid sender. */
	parentOrigin?: string;
	/** Called for each validated inbound CONFIG message. */
	onConfig: (message: ConfigMessage) => void;
}

export class Bridge {
	private lockedOrigin: string | undefined;
	private readonly parent: WindowProxy | null =
		window.parent === window ? null : window.parent;

	constructor(private readonly options: BridgeOptions) {
		this.lockedOrigin = options.parentOrigin;
		window.addEventListener("message", this.handleMessage);
	}

	dispose(): void {
		window.removeEventListener("message", this.handleMessage);
	}

	/** Send a message to the parent, targeted at the locked origin. */
	send(message: OutboundMessage): void {
		if (this.parent === null) {
			return; // Not embedded (top-level window); nothing to talk to.
		}
		const targetOrigin = this.lockedOrigin;
		if (targetOrigin === undefined) {
			// No origin established yet; refuse to broadcast to "*".
			return;
		}
		const envelope: Envelope<OutboundMessage> = {
			source: PROTOCOL_SOURCE,
			...message,
		};
		this.parent.postMessage(envelope, targetOrigin);
	}

	private readonly handleMessage = (event: MessageEvent): void => {
		// Ignore traffic that is not from our parent frame.
		if (this.parent !== null && event.source !== this.parent) {
			return;
		}
		if (!isOceanEnvelope(event.data)) {
			return;
		}
		if (!this.isOriginAllowed(event.origin)) {
			// eslint-disable-next-line no-console
			console.warn(
				`[ocean-viewer] rejected message from origin ${event.origin}`,
			);
			return;
		}
		// First accepted message locks the origin when not pre-configured.
		this.lockedOrigin ??= event.origin;

		if (isConfigMessage(event.data)) {
			this.options.onConfig(event.data);
		}
	};

	private isOriginAllowed(origin: string): boolean {
		if (this.lockedOrigin !== undefined) {
			return origin === this.lockedOrigin;
		}
		// No configured origin yet: accept the handshake from any concrete origin
		// (never the opaque "null" origin), then lock onto it.
		return origin !== "null" && origin.length > 0;
	}
}
