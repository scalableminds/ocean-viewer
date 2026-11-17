---
"@scalableminds/ocean-viewer": patch
---

**Fixed:** `oceanZoomDamping` no longer stretches the 3D view. Zooming the
cross-sections used to change the elevation stretch of the whole viewer, so the
3D scene and its meshes grew or flattened with every 2D zoom. The 3D panel now
keeps the static `relativeDisplayScales` exaggeration only; the cross-sections
damp as before. Applies to the default `3panel` layout.
