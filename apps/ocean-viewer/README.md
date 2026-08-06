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
| [@ocean-viewer/protocol](../../packages/protocol/src/index.ts) | CONFIG / READY / REPORT / CLICK message contract |
| [@ocean-viewer/colormaps](../../packages/colormaps/src/index.ts) | Colour data behind each colormap id |
| [src/chrome.css](src/chrome.css) | Hides Neuroglancer's built-in UI chrome (CSS-only) |

## Parent ↔ iframe protocol

- **CONFIG** (inbound): a Neuroglancer state JSON. First message is a full state;
  later messages are partial updates merged onto the current state, preserving
  camera position/orientation unless explicitly included.
- **READY** (outbound): sent once when the viewer is initialised and the bridge is
  listening. The parent should wait for it before sending its first CONFIG.
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
"oceanColormap": { "colormapId": "viridis", "valueMin": 10, "valueMax": 20,
                   "logScale": true, "valueClamp": true }
```

`colormapId` is a colormap id or a raw GLSL shader string (passed through);
`logScale` enables logarithmic rendering, `valueClamp` clamps to
`[valueMin, valueMax]`, `colormapInvert` reverses the colormap, and missing
voxels (`NaN`, the CMEMS fill value, or an explicit `noDataValue`) render
transparent. See the [protocol README](../../packages/protocol/README.md#layers--oceancolormap)
for the full field list.

The 26 colormap ids and their colour data live in
[@ocean-viewer/colormaps](../../packages/colormaps/); this app compiles the one a
layer names into a GLSL `cmap()` function, since Neuroglancer itself only ships
`colormapJet`/`colormapCubehelix`.

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
working CONFIG payload. For an interactive parent mock — a layer panel with
visibility / opacity / colour map / min-max controls that drives the iframe —
see [my-ocean-mock/](../my-ocean-mock/README.md).
