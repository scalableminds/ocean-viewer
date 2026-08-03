# Ocean Viewer ⇄ Data Portal — postMessage Protocol

Contract between the MyOcean Data Portal (parent page) and the embedded Ocean Viewer iframe, exchanged over `window.postMessage`. Source of truth: [`src/index.ts`](./src/index.ts) in this package (published internally as `@ocean-viewer/protocol`).

**Status: draft.** The wire schema is still being finalized with the MyOcean team — expect field-level changes.

## Message

Every message is a plain JSON object:

```ts
type Message = {
  namespace: "ocean-viewer";
  type: "CONFIG" | "REPORT" | "CLICK";
  state: ViewerStateJson;
};
```

`type` discriminates the payload: `"CONFIG"` (inbound), `"REPORT"` | `"CLICK"` (outbound). This shape check alone only distinguishes Ocean Viewer traffic from other `postMessage` noise on the same window — it doesn't check sender origin. The viewer's bridge does that separately: it locks onto the parent's origin (configured at build time, or the first valid sender as a handshake) and rejects every other origin after that.

## Messages

| Direction | Type | Purpose |
|---|---|---|
| Portal → Viewer | `CONFIG` | Set or update viewer state |
| Viewer → Portal | `REPORT` | Full state after user interaction |
| Viewer → Portal | `CLICK` | World + geographic position of a click |

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
  world: number[];                    // raw world-space position
  geographic: {
    longitude: number; latitude: number; depth: number;
    extra?: Record<string, number>;   // other dims, e.g. { time: 17 }
    units?: Record<string, string>;   // per-axis physical units
  };
}
```

## ViewerStateJson

Neuroglancer's JSON viewer-state schema ([docs](https://neuroglancer-docs.web.app/json/api/index.html)) plus one Ocean Viewer extension:

- `oceanAxisUnits?: Record<string, string>` — e.g. `{ "x": "°E", "y": "°N", "z": "m" }`. Labels the X/Y/Z position readouts; Neuroglancer's own coordinate units are SI-only, so this is stripped before the state reaches Neuroglancer.

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

### Colormap ids

A colormap is identified by its name. The 26 available ids are:

`algae`, `amp`, `balance`, `bloom`, `cividis`, `cyclic`, `delta`, `dense`,
`difference`, `gray`, `haline`, `ice`, `inferno`, `magma`, `matter`, `ncview`,
`ocean`, `plasma`, `rainbow`, `solar`, `speed`, `tempo`, `ternary`, `thermal`,
`twilight`, `viridis`


An unknown id falls back to `viridis`. The colour data behind each id lives in
`@ocean-viewer/colormaps`, shared by the viewer's shaders and the portal's UI so
that a layer's legend matches what is drawn on the map.

A real `state`, as sent by the `my-ocean-mock` demo (see `apps/my-ocean-mock/src/layers.ts`):

```json
{
  "dimensions": { "x": [1, ""], "y": [1, ""], "z": [1, ""], "t": [1, ""], "tc": [1, ""] },
  "oceanAxisUnits": { "x": "°E", "y": "°N" },
  "position": [0, 0, 49, 423, 635],
  "crossSectionScale": 0.9,
  "projectionScale": 2048,
  "layout": "4panel-alt",
  "layers": [
    {
      "type": "image",
      "name": "thetao",
      "visible": true,
      "source": {
        "url": "https://s3.waw3-1.cloudferro.com/mdl-arco-time-012/arco/GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m_202406/timeChunked.zarr/thetao/|zarr2:",
        "transform": {
          "matrix": [
            [0, 0, 0, 0.08333333333333333, -180],
            [0, 0, -0.08333333333333333, 0, 80],
            [0, 1, 0, 0, 0],
            [1, 0, 0, 0, 0]
          ],
          "outputDimensions": { "x": [1, ""], "y": [1, ""], "z": [1, ""], "t": [1, ""] }
        },
        "enableDefaultSubsources": true
      },
      "oceanColormap": {
        "colormapId": "magma",
        "valueMin": 0,
        "valueMax": 30,
        "logScale": false,
        "valueClamp": true
      }
    },
    {
      "type": "image",
      "name": "deptho",
      "visible": false,
      "source": {
        "url": "https://s3.waw3-1.cloudferro.com/mdl-arco-time-015/arco/GLOBAL_ANALYSISFORECAST_WAV_001_027/cmems_mod_wav_anfc_0.083deg_static_202211--ext--bathy/static.zarr/deptho/|zarr2:",
        "transform": {
          "matrix": [
            [0, 0.08333333333333333, -180],
            [-0.08333333333333333, 0, 80]
          ],
          "outputDimensions": { "x": [1, ""], "y": [1, ""] }
        },
        "enableDefaultSubsources": true
      },
      "oceanColormap": {
        "colormapId": "viridis",
        "valueMin": 0,
        "valueMax": 300,
        "logScale": false,
        "valueClamp": true,
        "noDataValue": -32767
      }
    }
  ]
}
```
