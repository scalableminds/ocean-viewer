/**
 * postMessage bridge between the Ocean Viewer iframe and its parent (MyOcean).
 *
 * Inbound traffic is restricted to a parent origin, supplied at build time via
 * `VITE_PARENT_ORIGIN` or else locked onto the first valid sender (handshake).
 * Outbound messages always target the locked origin, never `*`.
 */

import {
	type ConfigMessage,
	isConfigMessage,
	isOceanMessage,
	type Message,
	type OutboundMessage,
	PROTOCOL_NAMESPACE,
} from "@ocean-viewer/protocol";

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
		this.post(message, targetOrigin);
	}

	/**
	 * Announce that the viewer is initialised and listening, so the parent can
	 * send its first CONFIG instead of waiting out a timeout.
	 *
	 * Sent before any inbound message, so without a build-time
	 * `VITE_PARENT_ORIGIN` this is the one message broadcast to "*". READY
	 * carries no payload, so that discloses nothing beyond the iframe existing.
	 */
	sendReady(): void {
		if (this.parent === null) {
			return;
		}
		this.post({ type: "READY" }, this.lockedOrigin ?? "*");
	}

	private post(message: OutboundMessage, targetOrigin: string): void {
		const envelope: Message<OutboundMessage> = {
			namespace: PROTOCOL_NAMESPACE,
			...message,
		};
		this.parent?.postMessage(envelope, targetOrigin);
	}

	private readonly handleMessage = (event: MessageEvent): void => {
		// Ignore traffic that is not from our parent frame.
		if (this.parent !== null && event.source !== this.parent) {
			return;
		}
		if (!isOceanMessage(event.data)) {
			return;
		}
		if (!this.isOriginAllowed(event.origin)) {
			// eslint-disable-next-line no-console
			console.warn(
				`[ocean-viewer] rejected message from origin ${event.origin}`,
			);
			return;
		}
		// First accepted message locks the origin, if not pre-configured.
		this.lockedOrigin ??= event.origin;

		if (isConfigMessage(event.data)) {
			this.options.onConfig(event.data);
		}
	};

	private isOriginAllowed(origin: string): boolean {
		if (this.lockedOrigin !== undefined) {
			return origin === this.lockedOrigin;
		}
		// Accept the handshake from any concrete origin (never the opaque "null").
		return origin !== "null" && origin.length > 0;
	}
}
