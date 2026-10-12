---
"@scalableminds/ocean-viewer": patch
---

**Added:** Each cross-section now shows a line where each of the other
cross-sections on screen cuts it, in that section's colour, so the slice
orientation stays readable after the data is rotated. Neuroglancer's own axis
lines are off by default, in the 3D panel too; a CONFIG can turn them back on
with `showAxisLines: true`.
