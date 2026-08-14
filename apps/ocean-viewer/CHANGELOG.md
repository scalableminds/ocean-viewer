# @scalableminds/ocean-viewer

## 1.1.0

### Minor Changes

- [#2](https://github.com/scalableminds/ocean-viewer/pull/2) [`ae73c3f`](https://github.com/scalableminds/ocean-viewer/commit/ae73c3f1604ab0c7b2cf0fe2d1592c5b89fa79a4) Thanks [@hotzenklotz](https://github.com/hotzenklotz)! - **Added:** `↺` / `↻` buttons in the top-right corner of the XY panel, turning the data
  15° per press within the viewing plane. They match the camera buttons on the 3D panel,
  and they are now the only way to rotate a cross-section — the gestures that used to do
  it by accident (`shift` + arrow keys, `shift` + drag, two-finger twist) are gone.
  
  Rotating a cross-section turns the shared cross-section frame, so the XZ and YZ panels
  cut obliquely afterwards. The 3D camera has its own orientation and stays put.

### Patch Changes

- [`d7188fd`](https://github.com/scalableminds/ocean-viewer/commit/d7188fd8891752692f33dd154490b653353d3b07) Thanks [@hotzenklotz](https://github.com/hotzenklotz)! - **Fixed:** cross-section planes in the 3D panel no longer render as opaque black
  rectangles. Neuroglancer textures each 2D panel's whole viewport onto its plane in the
  projection view and paints everything the data doesn't cover with the cross-section
  background colour, so the planes showed up as black sheets with the data inset in them.
  
  The viewer now defaults `hideCrossSectionBackground3D` to `true`, which discards those
  texels instead of filling them. Land, below-seafloor and other no-data cells are
  already emitted transparent, so they drop out of the 3D view as well. Send
  `hideCrossSectionBackground3D: false` in a `CONFIG` to get the previous appearance back.

- [`105e630`](https://github.com/scalableminds/ocean-viewer/commit/105e630ecc081c0b7f7ba581a0040ba7626ad520) Thanks [@hotzenklotz](https://github.com/hotzenklotz)! - **Changed:** the `⌂` button on the 3D panel now restores the zoom the latest `CONFIG`
  asked for via `projectionScale`, instead of always recomputing Neuroglancer's
  fit-the-data default. A `CONFIG` that names no `projectionScale` keeps the old
  behaviour, so hosts that never send one see no change.

## 1.0.0

### Major Changes

- [`b110173`](https://github.com/scalableminds/ocean-viewer/commit/b1101730de12a90b321cb50e209262c44c39b8cc) Thanks [@hotzenklotz](https://github.com/hotzenklotz)! - **Breaking:** the viewer is now distributed as a versioned tarball attached to each
  GitHub release, rather than something each host builds itself.
  
  What the host page has to change: point the iframe at a pinned release instead of a
  self-built bundle. Either
  `npm i https://github.com/scalableminds/ocean-viewer/releases/download/v1.0.0/ocean-viewer-1.0.0.tgz`,
  or extract the same tarball onto a static host and serve `dist/`. The README covers
  both paths, plus the two hosting details that matter (`application/wasm` for `.wasm`,
  and no SPA catch-all rewrite).
  
  Nothing about the postMessage protocol changed, so existing `CONFIG` / `READY` /
  `REPORT` / `CLICK` / `HOVER` handling keeps working as-is.
  
  **Added:** `dist/version.json` reports the running build's `version`, `commit` and
  `builtAt` at a fixed URL, so "which build is on this server?" is answerable without
  devtools.
