---
"@scalableminds/ocean-viewer": patch
---

**Fixed:** Rotating the data with ↺ / ↻ now turns the 3D panel too, not just
the 2D cross-sections. The 3D panel's ⌂ / XY / XZ / YZ buttons line the camera
up with the rotated sections, instead of snapping back to the unrotated data.
Each section's outline in the 3D panel now traces where that section actually
cuts the data, so it stays on the data's edges after a rotation.
