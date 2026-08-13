# Ocean Viewer

An npm-workspaces monorepo with two apps and a shared package:

| App | What it is |
|---|---|
| [apps/ocean-viewer](apps/ocean-viewer/README.md) | A **Volumetric Viewer** for the MyOcean Data Portal, built on [Neuroglancer](https://github.com/google/neuroglancer) and embedded as an `<iframe>`. |
| [apps/my-ocean-mock](apps/my-ocean-mock/README.md) | A React mock of the MyOcean Data Portal parent page, for local development of the viewer's CONFIG protocol. |

| Package | What it is |
|---|---|
| [packages/protocol](packages/protocol/src/index.ts) | The shared `postMessage` API contract (message types, `ViewerStateJson`, type guards) between the two apps above. |

The two apps only talk to each other at runtime, over `postMessage` API through an
iframe, using the types from `packages/protocol` — see each app's own README
for details.

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
npm run dev -w @scalableminds/ocean-viewer  # http://localhost:5174
npm run dev -w my-ocean-mock   # http://localhost:5180 (separate terminal)
```

Other useful root-level scripts (fan out to both apps): `npm run typecheck`,
`npm run build`, `npm run check` (Biome lint + format).

## Releases

**`apps/ocean-viewer` is the only shippable workspace.** It is released as
`@scalableminds/ocean-viewer`: a single self-contained `npm pack` tarball attached to
each [GitHub release](https://github.com/scalableminds/ocean-viewer/releases). There
is no npm registry, no GitHub Packages and no CDN — consumers self-host the bundle.

- **Embedding it?** Read [apps/ocean-viewer/README.md](apps/ocean-viewer/README.md):
  both install paths, the exact URLs, hosting notes and version pinning.
- **Changing it?** Read [CONTRIBUTING.md](CONTRIBUTING.md): how to write a changeset,
  what counts as a breaking change, and how a release is cut.

Versioning is driven by [changesets](https://github.com/changesets/changesets).
Every change carries a `.changeset/*.md` entry; merging the generated
`chore: release` PR is the only manual step in the release.
