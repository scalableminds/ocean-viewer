# my-ocean-mock

A minimal React mock of the **MyOcean Data Portal** parent app. It reproduces
the portal's layer-selection sidebar and embeds the Ocean Viewer in an
`<iframe>`, driving it over `postMessage` exactly as the real portal would. Use
it as an interactive harness when developing the viewer's CONFIG handling.

## What it does

- **Layer list** (left): three demo layers (`deptho`, `thetao`, `chl`) mirroring
  the portal screenshots.
- **Per-layer controls**: visibility toggle (eye), and an expandable settings
  panel (gear) with **opacity**, **colour map** swatches, a **reverse** checkbox
  (the protocol's `colormapInvert`), and **min/max** clamp bounds. The **log**
  button toggles linear/logarithmic scaling.
- **Live sync**: every change rebuilds the viewer state and posts it to the
  iframe. The first message is a `full` CONFIG (dimensions, camera, axis units,
  layers); subsequent changes are `partial` CONFIGs carrying only `layers`, so
  the viewer keeps the user's current camera position and zoom.
- **Pointer readout**: the world position and per-layer value from the viewer's
  `HOVER` (live, follows the cursor) and `CLICK` (pinned) messages.

The translation from UI layer → Neuroglancer image layer (+ the `oceanColormap`
extension) lives in [src/protocol.ts](src/protocol.ts).

## Run

The viewer dev server must be running first (it's the iframe target). Both apps
share one install at the repo root:

```sh
# in the repo root
npm install                 # see note below if it errors
npm run dev -w @scalableminds/ocean-viewer  # Ocean Viewer at http://localhost:5174
npm run dev -w my-ocean-mock  # mock portal at http://localhost:5180 (separate terminal)
```

Open http://localhost:5180. Point the iframe elsewhere with
`VITE_VIEWER_URL` (e.g. `VITE_VIEWER_URL=http://localhost:5174/ npm run dev`).

> **npm install note.** If a global `~/.npmrc` sets `min-release-age`, install
> with an empty user config: `npm install --userconfig /dev/null`.

## Data sources

The three layers are real CMEMS ARCO zarr arrays (see [src/layers.ts](src/layers.ts)):

| Layer | Variable | Grid | dtype | Renders? |
|---|---|---|---|---|
| `thetao` | sea-water potential temperature (4-D: time × elevation × lat × lon) | 1/12° | float32 | ✅ |
| `chl` | mass concentration of chlorophyll a (4-D) | 1/4° | float32 | ✅ |
| `deptho` | sea-floor depth (2-D: lat × lon) | 1/12° | **float64** | ❌ see below |

Each array's index space is mapped into a shared world space by a per-layer
`source.transform`: `x` = °E, `y` = °N (flipped north-up), `z` = elevation
index (0 = deepest ≈ −5728 m, 49 = surface), and `t`/`tc` = the two independent
time axes. Default position seeds an accessible surface slice (`z = 49`,
`t = 423`, `tc = 635`).

## Gotchas discovered wiring these up

- **float64 is unsupported.** `deptho` is `<f8`; Neuroglancer rejects it
  (`Unsupported numpy data type: "<f8"`). It stays in the panel for UI parity
  but won't render until served as float32. `thetao`/`chl` are `<f4` and render.
- **x/y/z must lead `outputDimensions`.** Neuroglancer derives the global
  dimension order from the loaded layer sources and uses the first three as the
  4-panel display dimensions. Listing `x, y, z` first guarantees the panels show
  the lon/lat map (not time/elevation sections) and keeps the `position` array
  aligned regardless of which layers are visible.
- **Every update is a full CONFIG.** Because the layers span different
  dimensions, a partial (`layers`-only) update lets Neuroglancer re-derive the
  dimension order from whichever layers are visible and scrambles the axes. The
  mock always sends a full state and grafts the user's camera back on from
  inbound `REPORT`s (see [src/OceanViewerFrame.tsx](src/OceanViewerFrame.tsx)).
- **The first CONFIG waits for `READY`, not `load`.** The iframe's `load` event
  fires before the viewer's bootstrap has attached its bridge, so a CONFIG sent
  there is dropped. The viewer posts a `READY` message once it is listening; the
  mock sends the initial full state in response to it.
- **Partial CMEMS access.** Only some time/elevation chunks are served (the
  deepest level and many time steps return 403); the seeded slice is known-good.
- Colour-map swatches and colour bars are CSS gradients built from the same
  `@ocean-viewer/colormaps` stop lists the viewer compiles into GLSL, so the
  legend matches the render; the rendering itself is done by the viewer.
