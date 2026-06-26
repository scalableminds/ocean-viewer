# Ocean Viewer

A **Volumetric Viewer** for the MyOcean Data Portal, built on
[Neuroglancer](https://github.com/google/neuroglancer) and embedded as an
`<iframe>`. The portal drives the viewer and reads back state/clicks over
`postMessage()`.

## Setup

```sh
npm install
npm run dev        # dev server at http://localhost:5174
npm run build      # production build
npm run preview    # serve the production build
npm run typecheck
```

## Architecture

A thin TypeScript wrapper around the `neuroglancer` npm package:

| File | Role |
|---|---|
| [src/main.ts](src/main.ts) | Bootstrap: create viewer, seed `#!` hash, attach bridge |
| [src/wrapper/viewer.ts](src/wrapper/viewer.ts) | Create the Neuroglancer viewer (no live URL binding) |
| [src/wrapper/bridge.ts](src/wrapper/bridge.ts) | Origin-restricted `postMessage` in/out |
| [src/wrapper/config.ts](src/wrapper/config.ts) | Apply CONFIG (full replace / partial merge) |
| [src/wrapper/report.ts](src/wrapper/report.ts) | Debounced REPORT of viewer state |
| [src/wrapper/colormaps.ts](src/wrapper/colormaps.ts) | Named colormap → GLSL shader resolver |
| [src/protocol.ts](src/protocol.ts) | CONFIG / REPORT / CLICK message contract |
| [src/chrome.css](src/chrome.css) | Hides Neuroglancer's built-in UI chrome (CSS-only) |

## Parent ↔ iframe protocol

- **CONFIG** (inbound): a Neuroglancer state JSON. First message is a full state;
  later messages are partial updates merged onto the current state, preserving
  camera position/orientation unless explicitly included.
- **REPORT** (outbound): debounced serialised state after user interaction.
- **CLICK** (outbound): world coordinates converted to geographic lon/lat/depth.

Set the allowed parent origin at build time via `VITE_PARENT_ORIGIN`; otherwise
the bridge locks onto the first valid sender.

## Data sources

Zarr (v2/v3, OME-Zarr) via the kvstore syntax `https://…/array/|zarr2:`, and
`precomputed://` for cloud-hosted segmentation. Plain Zarr has no spatial
metadata, so supply axis order/orientation via the layer `source.transform`
(e.g. invert x and y — see the example).

## Colormaps

Image layers may carry an `oceanColormap` field (an Ocean Viewer extension) that
the wrapper resolves into the layer `shader`:

```json
"oceanColormap": { "colormap": "viridis", "dataMin": 10, "dataMax": 20,
                   "scale": "log", "clamp": true }
```

`colormap` is a named map (`viridis`, `magma`, `plasma`, `inferno`, `turbo`,
`jet`, `grayscale`) or a raw GLSL shader string (passed through). `scale: "log"`
enables logarithmic rendering; `clamp` clamps to `[dataMin, dataMax]`; missing
(`NaN`) voxels render black.

## Axis units

The X/Y/Z position readout is labelled with physical units supplied via the
top-level CONFIG field `oceanAxisUnits` (a dimension-name → unit map):

```json
"oceanAxisUnits": { "x": "°E", "y": "°N", "z": "m" }
```

This is an Ocean Viewer extension (resolved in [src/wrapper/units.ts](src/wrapper/units.ts))
rather than Neuroglancer coordinate-space units, because Neuroglancer's units
are SI-only and reject strings like `"°"`. The labels are matched by dimension
name and re-applied when the coordinate space changes.

See [examples/thetao.config.json](examples/thetao.config.json) for a complete,
working CONFIG payload, and [dev-parent.html](dev-parent.html) for a local
parent-page harness.
