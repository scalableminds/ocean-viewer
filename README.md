# Ocean Viewer

An npm-workspaces monorepo with two apps:

| App | What it is |
|---|---|
| [apps/ocean-viewer](apps/ocean-viewer/README.md) | A **Volumetric Viewer** for the MyOcean Data Portal, built on [Neuroglancer](https://github.com/google/neuroglancer) and embedded as an `<iframe>`. |
| [apps/my-ocean-mock](apps/my-ocean-mock/README.md) | A React mock of the MyOcean Data Portal parent page, for local development of the viewer's CONFIG protocol. |

The two only talk to each other at runtime, over `postMessage` through an
iframe — see each app's own README for details.

## Setup

One install covers both apps:

```sh
npm install
```

> **npm install note.** If a global `~/.npmrc` sets `min-release-age`, one of
> Neuroglancer's transitive dependencies (a git-pinned commit) will fail to
> install. Work around it with an empty user config:
> `npm install --userconfig /dev/null`.

## Run

```sh
npm run dev -w ocean-viewer    # http://localhost:5174
npm run dev -w my-ocean-mock   # http://localhost:5180 (separate terminal)
```

Other useful root-level scripts (fan out to both apps): `npm run typecheck`,
`npm run build`, `npm run check` (Biome lint + format).
