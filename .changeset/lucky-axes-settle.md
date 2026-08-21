---
"@scalableminds/ocean-viewer": minor
---

**Added:** `oceanZoomDamping`, a per-dimension exponent in `[0, 1]`
that makes a dimension's `relativeDisplayScales` factor track the shared
cross-section zoom — `0` zooms with the map (unchanged behaviour), `1` holds the
axis still on screen. Intended for the elevation axis, whose range is tiny next to
lon/lat, so zooming the map no longer lurches the XZ/YZ sections.

`relativeDisplayScales` itself is now re-asserted by dimension name after
Neuroglancer re-derives the coordinate space, which previously dropped it.
