---
"@scalableminds/ocean-viewer": patch
---

**Added:** Each cross-section panel now carries a caption in its top-left
corner naming the two dataset dimensions it spans, horizontal first — e.g.
`lon · lat` and `lon · depth` — so the three look-alike panels can be told
apart at a glance. The names are the ones the CONFIG's `dimensions` gives, and
the caption follows a renamed dimension and a turned section. It is
click-through, so it doesn't shadow panning or click/hover reporting.
