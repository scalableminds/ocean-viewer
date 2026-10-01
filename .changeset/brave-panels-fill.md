---
"@scalableminds/ocean-viewer": patch
---

**Added:** A fullscreen toggle on each cross-section (XY, XZ and YZ), next to
the XY panel's rotation buttons. It switches the viewer to that panel alone and
back to the layout it was pressed in, keeping the camera and any rotation. The
3D panel has none. A fullscreen panel stays fullscreen across CONFIGs that keep
the layout (e.g. the full state re-sent on every layer edit); a CONFIG asking for
a different layout still wins.
