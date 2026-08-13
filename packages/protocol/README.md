# Ocean Viewer ⇄ Data Portal — postMessage Protocol

Contract between the MyOcean Data Portal (parent page) and the embedded Ocean Viewer iframe, exchanged over `window.postMessage`. Source of truth: [`src/index.ts`](./src/index.ts) in this package (published internally as `@ocean-viewer/protocol`).

**Status: draft.** The wire schema is still being finalized with the MyOcean team — expect field-level changes.

## Message

Every message is a plain JSON object:

```ts
type Message = {
  namespace: "ocean-viewer";
  type: "CONFIG" | "READY" | "REPORT" | "CLICK" | "HOVER";
  state: ViewerStateJson;
};
```

`type` discriminates the payload: `"CONFIG"` (inbound), `"READY"` | `"REPORT"` | `"CLICK"` | `"HOVER"` (outbound). This shape check alone only distinguishes Ocean Viewer traffic from other `postMessage` noise on the same window — it doesn't check sender origin. The viewer's bridge does that separately: it locks onto the parent's origin (configured at build time, or the first valid sender as a handshake) and rejects every other origin after that.

## Messages

| Direction | Type | Purpose |
|---|---|---|
| Portal → Viewer | `CONFIG` | Set or update viewer state |
| Viewer → Portal | `READY` | Viewer initialized; CONFIG can be sent |
| Viewer → Portal | `REPORT` | Full state after user interaction |
| Viewer → Portal | `CLICK` | World position of a click, plus per-layer values |
| Viewer → Portal | `HOVER` | The same payload as `CLICK`, throttled, as the pointer moves |

### READY

```ts
{ type: "READY" }
```

Sent exactly once per viewer document, as soon as Neuroglancer is created and the bridge is listening. The portal should send its first CONFIG in response to this rather than on the iframe's `load` event (which fires before the viewer's bootstrap runs) or after a fixed delay.

READY precedes any inbound message, so the origin handshake has not happened yet: unless the viewer was built with a fixed `VITE_PARENT_ORIGIN`, it is the only message posted with a `*` target origin. It carries no payload. A portal that wants to be strict should still check `event.origin` against the viewer's own origin before acting on it.

### CONFIG

```ts
{ type: "CONFIG"; state: ViewerStateJson; mode?: "full" | "partial" }
```

The first CONFIG a viewer receives is treated as full state (applied with a reset). Later ones default to a partial merge onto current state — preserving camera position/orientation unless the incoming state sets them. `mode` overrides that default when set explicitly.

### REPORT

```ts
{ type: "REPORT"; state: ViewerStateJson }
```

### CLICK

```ts
{
  type: "CLICK";
  world: number[];                    // raw world-space position, in the
                                      // axis order of the state's `dimensions`
  layers: {                           // one entry per visible layer
    name: string;
    value: number | number[] | string | null;   // physical units; null = no value
  }[];
}
```

## ViewerStateJson

Neuroglancer's JSON viewer-state schema ([docs](https://neuroglancer-docs.web.app/json/api/index.html)), unextended at the top level — the one Ocean Viewer extension is the per-layer `oceanColormap` below.

Core Neuroglancer fields (all optional): `dimensions`, `position`, `layers`, `layout`, camera (`crossSection*`, `projection*`), display toggles (`showAxisLines`, `showScaleBar`, `showSlices`, …), perf limits (`gpuMemoryLimit`, `concurrentDownloads`, `prefetch`, …). Neuroglancer's state is untyped end-to-end — this is hand-modeled from its docs, not imported from a package.

### Layers & `oceanColormap`

Layers re-use the [Neuroglancer API](https://neuroglancer-docs.web.app/json/api/index.html#json-Layer). Each layer entry (`type`, `name`, `visible`, `source`, plus passthrough fields) may carry an Ocean Viewer-only `oceanColormap`:

| Field | Type | Default | Notes |
|---|---|---|---|
| `colormapId` | colormap id or raw GLSL string | required | one of the ids below, or a shader passed through verbatim |
| `valueMin` / `valueMax` | number | required | data range mapped to colormap 0–1 (1–0 when `colormapInvert` is set) |
| `logScale` | boolean | `false` | logarithmic instead of linear normalization |
| `valueClamp` | boolean | `false` | clamp out-of-range values to the endpoints |
| `colormapInvert` | boolean | `false` | use the colormap in reverse order |
| `noDataValue` | number | — | raw-value sentinel for missing data, checked before scale/offset (NaN and CMEMS's ~9.969e36 fill are always treated as missing regardless) |
| `scaleFactor` / `addOffset` | number | `1` / `0` | CF packing: `physical = raw * scaleFactor + addOffset` |

`oceanColormap` is compiled into the layer `shader` but is **kept** on the
layer rather than stripped: `scaleFactor`/`addOffset`/`noDataValue` say what a
stored number means, and the viewer's image layer applies them to every value
readout (the layer bar, the selection panel, and `CLICK`/`HOVER`). Neuroglancer
ignores layer keys it doesn't know, so the state stays valid for a stock
instance.

### Colormap ids

A colormap is identified by its name. The 26 available ids are:

`algae`, `amp`, `balance`, `bloom`, `cividis`, `cyclic`, `delta`, `dense`,
`difference`, `gray`, `haline`, `ice`, `inferno`, `magma`, `matter`, `ncview`,
`ocean`, `plasma`, `rainbow`, `solar`, `speed`, `tempo`, `ternary`, `thermal`,
`twilight`, `viridis`


An unknown id falls back to `viridis`. The colour data behind each id lives in
`@ocean-viewer/colormaps`, shared by the viewer's shaders and the portal's UI so
that a layer's legend matches what is drawn on the map.

### Full example

A real CONFIG message, exactly as the `my-ocean-mock` demo posts it (see `apps/my-ocean-mock/src/layers.ts`) — the `namespace`/`type`/`mode` envelope wrapping a full `state`. Two CMEMS ARCO zarr arrays from one product (`GLOBAL_MULTIYEAR_PHY_001_030`, daily 1/12°) share a world space of `x` (°E), `y` (°N) and `elevation` (level index):

```json
{
  "namespace": "ocean-viewer",
  "type": "CONFIG",
  "state": {
    "dimensions": {
      "x": [1, ""],
      "y": [1, ""],
      "elevation": [1, ""]
    },
    "position": [0, 0, 0],
    "crossSectionScale": 0.9,
    "projectionScale": 2048,
    "layout": "4panel-alt",
    "layers": [
      {
        "type": "image",
        "name": "so",
        "visible": false,
        "opacity": 1,
        "source": {
          "url": "https://s3.waw3-1.cloudferro.com/mdl-arco-time-025/arco/GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/timeChunked.zarr/so/|zarr2:",
          "transform": {
            "matrix": [
              [0, 0, 0, 0.08333333333333333, -180],
              [0, 0, -0.08333333333333333, 0, 80],
              [0, -1, 0, 0, 49],
              [1, 0, 0, 0, 0]
            ],
            "outputDimensions": {
              "x": [1, ""],
              "y": [1, ""],
              "elevation": [1, ""],
              "time'": [1, ""]
            }
          },
          "enableDefaultSubsources": true
        },
        "localDimensions": {
          "time'": [1, ""]
        },
        "localPosition": [12000],
        "oceanColormap": {
          "colormapId": "haline",
          "valueMin": 0.0015,
          "valueMax": 42.5,
          "logScale": false,
          "colormapInvert": false,
          "valueClamp": true,
          "noDataValue": -32767,
          "scaleFactor": 0.0015259254723787308,
          "addOffset": -0.0015259254723787308
        }
      },
      {
        "type": "image",
        "name": "thetao",
        "visible": true,
        "opacity": 1,
        "source": {
          "url": "https://s3.waw3-1.cloudferro.com/mdl-arco-time-025/arco/GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/timeChunked.zarr/thetao/|zarr2:",
          "transform": {
            "matrix": [
              [0, 0, 0, 0.08333333333333333, -180],
              [0, 0, -0.08333333333333333, 0, 80],
              [0, -1, 0, 0, 49],
              [1, 0, 0, 0, 0]
            ],
            "outputDimensions": {
              "x": [1, ""],
              "y": [1, ""],
              "elevation": [1, ""],
              "time'": [1, ""]
            }
          },
          "enableDefaultSubsources": true
        },
        "localDimensions": {
          "time'": [1, ""]
        },
        "localPosition": [12000],
        "oceanColormap": {
          "colormapId": "thermal",
          "valueMin": -3,
          "valueMax": 30,
          "logScale": false,
          "colormapInvert": false,
          "valueClamp": true,
          "noDataValue": -32767,
          "scaleFactor": 0.0007324442267417908,
          "addOffset": 21
        }
      }
    ]
  },
  "mode": "full"
}
```

Notes on the parts that are easy to get wrong:

- **The transform matrix has `outputDimensions.length` rows and (array rank + 1) columns**, one output per array dimension, with the last column the translation. `so`/`thetao` are both 4-D `(time, elevation, latitude, longitude)`; a lower-rank array (say a 3-D surface field with no depth axis) gets a transform one row and one column smaller.
- **Local dimensions end in `'`.** A dimension named `time'` in `outputDimensions` is kept out of the world space; the layer-level `localDimensions`/`localPosition` pair then pins the slice. Everything else is a world dimension and must appear in the top-level `dimensions`, whose length `position` must match.
- **World dimensions come first**, in display order. Neuroglancer derives the global dimension order from the loaded layer *sources*, not from `dimensions`, and uses the first three as the 4-panel display axes.
- **`y` and `elevation` are negated** because the panels draw the second and third display axes downwards. Here `y = -latitude` renders north-up, and `elevation = 49 - level` renders surface-up (the array's `elevation` coordinate ascends from -5727.9 m at index 0 to -0.494 m at index 49).
- **`subsources` overrides individual subsources by id**; the ones it doesn't name follow `enableDefaultSubsources`. The zarr driver publishes two: `default` (the volume) and `bounds` (the yellow data-bounds box). A layer that omits a world dimension is unbounded along it, so its box becomes an edgeless slab filling the section panels — such a layer wants `"bounds": false`.
- **`scaleFactor`/`addOffset` carry the CF packing.** These arrays are int16; Neuroglancer reads the raw integer, so passing the packing lets `valueMin`/`valueMax` and `noDataValue` stay meaningful — the value range in physical units, the fill sentinel in raw ones. The viewer applies the packing twice over: in the shader, and again to picked values so readouts are physical too.
