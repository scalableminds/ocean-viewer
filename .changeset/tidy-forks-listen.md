---
"@scalableminds/ocean-viewer": patch
---

**Changed:** the `⌂` button on the 3D panel now restores the zoom the latest `CONFIG`
asked for via `projectionScale`, instead of always recomputing Neuroglancer's
fit-the-data default. A `CONFIG` that names no `projectionScale` keeps the old
behaviour, so hosts that never send one see no change.
