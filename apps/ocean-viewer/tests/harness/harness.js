/**
 * Host page for the smoke test: a plain iframe driven over postMessage, exactly
 * as the README tells embedders to do it.
 */

const NAMESPACE = "ocean-viewer";
const params = new URLSearchParams(location.search);

/** What the spec reads back via page.evaluate. */
const smoke = { ready: null, reports: [], clicks: [], hovers: [] };
window.__smoke = smoke;

const iframe = document.createElement("iframe");
iframe.title = "Ocean Viewer";
iframe.style.border = "0";
iframe.style.width = "800px";
iframe.style.height = "600px";
iframe.src = params.get("src");
document.getElementById("host").appendChild(iframe);

const viewerOrigin = new URL(iframe.src, location.href).origin;

window.addEventListener("message", (event) => {
	if (event.source !== iframe.contentWindow) return;
	if (event.origin !== viewerOrigin) return;
	if (event.data?.namespace !== NAMESPACE) return;

	switch (event.data.type) {
		case "READY":
			smoke.ready = event.data;
			// Wait for READY, not `load`: `load` fires before the viewer's bridge is
			// listening, so a CONFIG sent then is dropped.
			iframe.contentWindow.postMessage(
				{
					namespace: NAMESPACE,
					type: "CONFIG",
					state: { showAxisLines: false },
					mode: "partial",
				},
				viewerOrigin,
			);
			break;
		case "REPORT":
			smoke.reports.push(event.data);
			break;
		case "CLICK":
			smoke.clicks.push(event.data);
			break;
		case "HOVER":
			smoke.hovers.push(event.data);
			break;
	}
});
