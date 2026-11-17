---
"@scalableminds/ocean-viewer": minor
---

**Changed:** The 3D camera is now elevation-up instead of north-up: the sea surface stays level and depth always runs down the screen. Dragging in the 3D panel turns it like a turntable on a vertical axis: horizontally to spin about elevation, vertically to tilt between looking straight down on the map and straight up at the seafloor; `r` / `e` spin the same way. The default view and ⌂ now look obliquely from the south, 60° off straight down, instead of top-down. YZ now shows depth running down rather than across. A CONFIG whose `projectionOrientation` has a roll is levelled on arrival, keeping its view direction.
