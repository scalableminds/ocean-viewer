---
"@scalableminds/ocean-viewer": patch
---

**Removed:** Neuroglancer's yellow bounding box around the whole dataset
(`showDefaultAnnotations`). It is drawn in every panel and says nothing MyOcean
hasn't already told the user about the dataset's extent, so in an embedded
viewer it is noise.
