# @ocean-viewer/colormaps

Colour data for the colormaps named by the Ocean Viewer protocol.

`@ocean-viewer/protocol` decides *which* colormaps exist (its `ColormapId`
union, and the `oceanColormap.colormapId` field that carries one over the wire);
this package is the single source of truth for what each of those ids actually
looks like. Both sides of the iframe need that:

- the **viewer** compiles the stops of the named colormap into the GLSL of an
  image layer's `shader` (see `apps/ocean-viewer/src/wrapper/colormaps.ts`) —
  Neuroglancer only ships `colormapJet`/`colormapCubehelix` natively;
- the **portal** paints the same stops into swatches and colour bars, so a
  layer's legend matches what is drawn on the map.

## Shape

```ts
import { COLORMAP_IDS, COLORMAP_STOPS, isColormapId } from "@ocean-viewer/colormaps";

COLORMAP_STOPS.viridis; // [[0, 68, 1, 84], [0.0588, 71, 25, 108], …]
```

A colormap is a list of `[position, r, g, b]` stops — position in `[0, 1]`,
channels 8-bit sRGB — interpolated linearly in between. `COLORMAP_STOPS` is
typed `Record<ColormapId, …>`, so adding an id to the protocol without adding
its colours here is a compile error.

## Regenerating

The stop lists in [`src/stops.ts`](src/stops.ts) are generated, not hand-written.
The reference colormaps are dense 256-entry lookup tables, one `<id>.js` file
per colormap, each ESM-default-exporting `[[r, g, b], …]`. Shipping all 256
entries would be wasteful — they end up inlined into the GLSL of every image
layer, and therefore into the viewer state, the REPORT messages and the URL
hash — so the generator fits each table with a piecewise-linear curve through a
subset of its own entries, accurate to within 1/255 per channel. That is
visually exact and cuts ~256 entries down to ~24.

```bash
npm run generate -w @ocean-viewer/colormaps -- <dir-of-reference-tables>
```

Pass a tolerance in 8-bit levels as a second argument to trade accuracy for
fewer stops (default `1`).
