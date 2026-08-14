---
"@scalableminds/ocean-viewer": patch
---

**Fixed:** cross-section planes in the 3D panel no longer render as opaque black
rectangles. Neuroglancer textures each 2D panel's whole viewport onto its plane in the
projection view and paints everything the data doesn't cover with the cross-section
background colour, so the planes showed up as black sheets with the data inset in them.

The viewer now defaults `hideCrossSectionBackground3D` to `true`, which discards those
texels instead of filling them. Land, below-seafloor and other no-data cells are
already emitted transparent, so they drop out of the 3D view as well. Send
`hideCrossSectionBackground3D: false` in a `CONFIG` to get the previous appearance back.
