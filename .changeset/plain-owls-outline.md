---
"@scalableminds/ocean-viewer": patch
---

**Added:** Each cross-section is now outlined in the 3D panel where it cuts the
dataset bounds, in the colour of one of the axes it carries (x / y / z → red /
green / blue, as on Neuroglancer's crosshair), with the panel's caption tinted
to match — so it is obvious in
3D where the three sections lie and which panel shows which. The outline
follows the section as the user scrolls through the third dimension.
