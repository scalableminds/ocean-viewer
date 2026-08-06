# AGENTS.md

See [README.md](README.md) for the user-facing overview.

## Golden rules (hard-won — don't relearn these the hard way)

1. **Never break worker bundling.** Neuroglancer runs its data pipeline in Web
   Workers (`new Worker(new URL("./chunk_worker.bundle.js", import.meta.url))`).
   Vite's esbuild scanner doesn't follow this and mangles the worker's `#src/*`
   imports → the worker silently dies → **no volumetric data renders** (the UI
   still mounts, hiding it). The fix is `optimizeDeps.entries` in
   [vite.config.ts](vite.config.ts) listing the three `*.bundle.js` worker
   entry points. Do not remove them. If you change Vite config or version,
   re-verify data rendering.
2. **Verify ACTUAL data rendering, never just that the UI mounts.** The worker
   break is invisible until real data loads. After any change that could touch
   bundling/workers/sources, load a real Zarr and confirm **colored voxels**
   appear (a constant `emitRGB(vec3(1,0,0))` shader shows nothing if chunks
   aren't decoding). Use the example: [examples/thetao.config.json](examples/thetao.config.json).
3. **Never call `viewer.state.reset()`.** Resetting then restoring an
   *incomplete* state leaves the viewer inconsistent and it async-reverts. Full
   replace is done via `restoreState({...pristine, ...state})` (see
   [src/wrapper/config.ts](src/wrapper/config.ts)); partial is `restoreState`
   with omitted keys preserved.
4. **No live `UrlHashBinding`.** It fights inbound CONFIG (re-asserts the URL and
   reverts programmatic state). We parse `#!{JSON}` once at startup instead
   (see [src/wrapper/viewer.ts](src/wrapper/viewer.ts)).
5. **Embedded viewer options:** create the viewer with
   `resetStateWhenEmpty: false` and `showLayerDialog: false`, or Neuroglancer
   force-resets the layout to `4panel-alt` and opens a new-layer dialog whenever
   there are no layers, clobbering injected state.

## Run & verify

```sh
npm install        # if it fails on the ikonate git dep, see README install note
npm run dev        # http://localhost:5174
npm run typecheck  # tsc --noEmit — must stay clean
npm run build
```

Local verification uses the **Claude preview tools** driving a server defined in
`.claude/launch.json`. To drive the viewer without the parent
portal, post a CONFIG to the window, or load a state via the `#!` URL hash. For
an interactive parent-side harness, see
[my-ocean-mock](../my-ocean-mock/README.md).

`window.viewer` (the Neuroglancer `Viewer`) and `window.oceanViewer`
(`{ resolveShader }`) are exposed for debugging/automation.

## Architecture & conventions

- Wrapper modules live in `src/wrapper/`; the parent↔iframe message contract is the
  shared [@ocean-viewer/protocol](../../packages/protocol/src/index.ts) package
  (`CONFIG` / `READY` / `REPORT` / `CLICK` / `HOVER`, each with a `namespace: "ocean-viewer"` envelope,
  origin-restricted).
- **Colormaps:** the portal can send a named colormap on an image layer via the
  `oceanColormap` field, which the wrapper resolves into the layer `shader`
  before `restoreState`
  ([@ocean-viewer/colormaps/shader](../../packages/colormaps/src/shader.ts)). `colormap` may also be
  a raw GLSL string (passed through). Missing/`NaN` voxels render black.
- **Data sources:** Zarr via `https://…/array/|zarr2:`; plain Zarr has no
  spatial metadata, so axis orientation comes from the layer `source.transform`
  (e.g. inverting x/y — see the example).
- **Hiding Neuroglancer UI:** done in [src/chrome.css](src/chrome.css) (CSS
  `display:none` on chrome classes), loaded last so it overrides NG's stylesheet.
  Keep the top-row **position widget** (X/Y/Z readout).
- Match the surrounding code style. Keep `tsc` clean (`strict`, no unused).

## Don't

- Don't bump or change the bundler setup without re-verifying data rendering.
- Don't add `optimizeDeps.exclude: ["neuroglancer"]` — it breaks the production
  build and triggers a dev re-optimization reload loop.
- Don't commit secrets or `.env`; `.claude/` and `.env` are gitignored.
- Don't reproduce large chunks of Neuroglancer source here — wrap, don't fork.
