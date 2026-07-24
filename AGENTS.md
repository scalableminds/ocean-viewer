# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## What this is

An npm-workspaces monorepo with two independent apps under `apps/`:

- **[apps/ocean-viewer](apps/ocean-viewer/)** — a thin TypeScript wrapper around
  the `neuroglancer` npm package, embedded as an `<iframe>` in the MyOcean Data
  Portal. Read **[apps/ocean-viewer/AGENTS.md](apps/ocean-viewer/AGENTS.md)**
  before touching it — it has hard-won, non-obvious "golden rules" (worker
  bundling, viewer state handling) that are easy to silently break.
- **[apps/my-ocean-mock](apps/my-ocean-mock/)** — a React mock of the MyOcean
  Data Portal parent page, used for local dev of the viewer's CONFIG protocol.
  See its own [README](apps/my-ocean-mock/README.md).

The two apps only talk to each other at runtime, over `postMessage` through an
iframe — there's no code-level dependency between them.

## Shared tooling

- **Biome** (lint + format) and the **Vite**/**TypeScript** versions are
  single-sourced as root `devDependencies` — install once at the repo root
  (`npm install`), not per-app.
- `tsconfig.base.json` holds the strict TS options common to both apps; each
  app's own `tsconfig.json` extends it.
- Run/build per app with `npm run dev -w <name>` / `npm run build -w <name>`
  (or `--workspaces` to fan out to both) from the repo root.

## Don't

- Don't commit secrets or `.env`; `.claude/` and `.env` are gitignored.
- Don't add app-specific dependencies or scripts to the root `package.json` —
  they belong in that app's own `package.json`.
