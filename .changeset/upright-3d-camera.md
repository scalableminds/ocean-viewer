---
"@scalableminds/ocean-viewer": minor
---

**Changed:** The 3D camera can no longer roll, so the world can't end up upside down. Dragging in the 3D panel now turns it like a turntable: horizontally to spin about the depth axis, vertically to tilt between looking straight down and straight up. A CONFIG whose `projectionOrientation` has a roll is levelled on arrival, keeping its view direction. Hosts that strip the roll themselves from REPORTs can stop doing so.
