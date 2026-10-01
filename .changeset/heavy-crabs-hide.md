---
"@scalableminds/ocean-viewer": patch
---

**Changed:** Neuroglancer's yellow bounding box around the whole dataset
(`showDefaultAnnotations`) is no longer drawn. It appeared in every panel and
said nothing MyOcean hasn't already told the user about the dataset's extent,
so in an embedded viewer it was noise.
