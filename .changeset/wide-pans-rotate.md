---
"@scalableminds/ocean-viewer": minor
---

**Added:** `↺` / `↻` buttons in the top-right corner of the XY panel, turning the data
15° per press within the viewing plane. They match the camera buttons on the 3D panel,
and they are now the only way to rotate a cross-section — the gestures that used to do
it by accident (`shift` + arrow keys, `shift` + drag, two-finger twist) are gone.

Rotating a cross-section turns the shared cross-section frame, so the XZ and YZ panels
cut obliquely afterwards. The 3D camera has its own orientation and stays put.
