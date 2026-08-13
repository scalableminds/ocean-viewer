# Ocean Viewer

A **volumetric viewer** for ocean model data — zarr / OME-Zarr — built on
[Neuroglancer](https://github.com/google/neuroglancer). Embed it as an `<iframe>`
and drive it over `postMessage`.

You host it yourself. This package is **not published to any registry** — it ships
as a tarball attached to each
[GitHub release](https://github.com/scalableminds/ocean-viewer/releases). The bundle
is static and self-contained: no runtime dependencies, no build step, no server code.

> While the repository is private, these release URLs are not publicly reachable —
> GitHub returns 404 for release downloads on private repos, even with a token. They
> start working when the repository becomes public.

## Install

Both paths use the same tarball.

**With npm:**

```bash
npm i https://github.com/scalableminds/ocean-viewer/releases/download/v1.0.0/ocean-viewer-1.0.0.tgz
```

The assets land in `node_modules/@scalableminds/ocean-viewer/dist/`; copy or alias
them into a static route. URL dependencies are exact pins — `^1.0.0` is not possible.

**Without npm:**

```bash
curl -fsSL https://github.com/scalableminds/ocean-viewer/releases/latest/download/ocean-viewer.tgz \
  | tar -xz --strip-components=1 -C /var/www/ocean-viewer
```

Use `ocean-viewer.tgz` for `latest` (the redirect only works for a fixed filename),
or `ocean-viewer-<version>.tgz` to pin.

**Verify a download:**

```bash
gh attestation verify ocean-viewer-1.0.0.tgz -R scalableminds/ocean-viewer
```

## Serve it

Serve `dist/` as plain static files. Two things to get right:

- **`Content-Type: application/wasm` for `.wasm`.** `WebAssembly.instantiateStreaming`
  rejects any other MIME type, and the failure looks like a data bug rather than a
  server one.
- **No SPA catch-all rewrite.** The viewer has no router and reads `location.hash`
  once at boot, so a catch-all would turn a real 404 on a hashed asset into a silent
  200 serving `index.html`.

Assets are referenced relatively, so any sub-path works with no rebuild. Every
release is tested by loading the packed tarball from a nonsensical sub-path.

The viewer runs WebAssembly and same-origin web workers (one of which spawns
another), and fetches data from whatever origins your `CONFIG` points it at. If you
serve a `Content-Security-Policy`, it needs to allow those; the specifics are yours
to decide.

## Embed it

```html
<iframe
  src="/ocean-viewer/dist/index.html"
  title="Ocean Viewer"
  style="border: 0; background: #000; width: 100%; height: 600px"
></iframe>
```

`background: #000` avoids the host page showing through before the viewer's
stylesheet loads.

```js
const iframe = document.querySelector("iframe");
const viewerOrigin = new URL(iframe.src, location.href).origin;

window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  if (event.origin !== viewerOrigin) return;
  if (event.data?.namespace !== "ocean-viewer") return;

  if (event.data.type === "READY") {
    iframe.contentWindow.postMessage(
      { namespace: "ocean-viewer", type: "CONFIG", state: myState, mode: "full" },
      viewerOrigin,
    );
  }
});
```

**Wait for `READY`, not `load`** — `load` fires before the viewer's bridge is
listening, so a `CONFIG` sent then is dropped.

The viewer only accepts messages from its immediate parent frame. Set
`VITE_PARENT_ORIGIN` at build time to pin the origin it will talk to; otherwise it
locks onto the first valid sender.

See [`examples/thetao.config.json`](examples/thetao.config.json) for a complete
`CONFIG`, and the [protocol reference](../../packages/protocol/README.md) for every
message and field.

## Browser support

WebGL2 **and** the `EXT_color_buffer_float` extension are hard requirements — the
viewer stays blank without either. Also ES2022, WebAssembly, and ES-module workers.

## Which build is running?

```bash
curl https://example.org/ocean-viewer/dist/version.json
# { "name": "...", "version": "1.0.0", "commit": "9f3c1d…", "builtAt": "…" }
```

## Upgrading

Release URLs are exact pins, and **neither Dependabot nor Renovate tracks URL
dependencies**, so there are no automated update PRs. Watch the repository's releases
(*Watch → Custom → Releases*), read the changelog, and replace the tarball.

Semver describes the **embed contract**: the postMessage protocol, the iframe URL
format, and minimum browser support. An internal rewrite that leaves those intact is
a patch, however large.

There is no rollback — you self-host, so a deployed version stays until you replace
it.

## Working on the viewer

```bash
npm install
npm run dev -w @scalableminds/ocean-viewer   # http://localhost:5174
```

Architecture and the rules for not breaking worker bundling are in
[AGENTS.md](AGENTS.md); releases and changesets in
[CONTRIBUTING.md](../../CONTRIBUTING.md). For an interactive parent page to develop
against, see [my-ocean-mock](../my-ocean-mock/README.md).
