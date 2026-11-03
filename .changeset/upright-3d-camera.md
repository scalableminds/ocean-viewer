---
"@scalableminds/ocean-viewer": minor
---

**Changed:** The 3D camera now stays north-up: meridians always run up and down the screen, so the map can no longer be rolled sideways or upside down. Dragging in the 3D panel turns it like a turntable on a north–south axis: horizontally to spin about that axis, vertically to tilt until looking along it from the south or the north. A CONFIG whose `projectionOrientation` has a roll is levelled on arrival, keeping its view direction. A partial CONFIG that sets `crossSectionOrientation` without `projectionOrientation` now turns the 3D camera with the data, as ↺ / ↻ do. Hosts that strip the roll themselves from REPORTs can stop doing so.
