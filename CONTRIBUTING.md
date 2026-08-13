# Contributing

## Repository shape

npm workspaces. **`apps/ocean-viewer` is the only released package** — it ships as
`@scalableminds/ocean-viewer`, a tarball attached to a GitHub release. The other three
workspaces are internal and are listed in `ignore` in `.changeset/config.json`.

## Writing a changeset

Every user-visible change needs one:

```sh
npx changeset
```

Select **`@scalableminds/ocean-viewer`**. Internal refactors a host cannot observe
get none, or an explicit `npx changeset --empty`.

### The four tags

Every changeset body must open with one of:

```
**Breaking:**    **Added:**    **Changed:**    **Fixed:**
```

`npm run lint:changesets` enforces this, and the PR check runs it. They exist because
changesets groups the changelog only by bump type (`### Major/Minor/Patch Changes`),
and a changelog module can't regroup those headings — `getReleaseLine` controls one
bullet, not the headings above it. So the category lives in the body.

### What counts as breaking

Semver here is the **embed contract**: the postMessage protocol, the iframe URL
format and attributes, and minimum browser support.

**Major:** removing or renaming a protocol field, narrowing an accepted value domain,
raising the browser floor, changing a `dist/` path a host references.

**Not major, however large the diff:** bumping Neuroglancer, adding an *optional*
protocol field or a new outbound message type, adding colormap ids, internal
rewrites, asset-hash changes, bundle size.

Hosts consume a message contract and a URL, not our module graph — so a rewrite that
leaves both intact is a patch.

### Breaking changesets say what the *host page* changes

Describe the work the operator has to do, not what we changed.

**Good:**

> **Breaking:** `HOVER` no longer includes hidden layers in `layers[]`. If your
> readout relied on entries for hidden layers, filter on your own visibility state
> instead.

**Bad:**

> **Breaking:** refactored `PointerForwarder` to filter the layer list before
> serialising.

The second describes our code; an operator can't tell whether their page needs
changing.

## Pull requests

CI runs Biome, typecheck, a production build, and the smoke test (which packs the
tarball and loads it from a sub-path). The changeset check runs separately.

If a change genuinely needs no changelog entry, apply the **`no-changeset`** label.

**Known gap:** because the other workspaces are in `ignore`, a PR touching *only*
`packages/protocol` or `apps/my-ocean-mock` won't be asked for a changeset. If you
change the wire contract on its own, add one by hand.

## Releasing

Merging is the only manual step. **Never tag, create a release, or merge the release
PR on someone's behalf.**

1. PRs land on `main`, each with a changeset.
2. `.github/workflows/release.yml` opens or updates a **`chore: release`** PR that
   bumps the version and folds the entries into `apps/ocean-viewer/CHANGELOG.md`,
   which `scripts/sync-changelog.js` then mirrors to the root `CHANGELOG.md`.
   (changesets hardcodes the changelog next to the package, so the root copy is
   generated — edit neither; add entries with `npx changeset`.) Review the PR as a
   migration document — it is what embedders read.
3. **Merge it.** That's the gate.
4. The workflow then builds (after the bump, so `dist/version.json` is right), runs
   the smoke test, packs, attests provenance, and creates a `v<version>` release with
   two assets: `ocean-viewer-<version>.tgz` and `ocean-viewer.tgz`.

The release step is guarded on the tag already existing, so re-running it on the same
commit does nothing. `npm publish` is impossible by construction — the package is
`"private": true`.


### One-time setup, if this is re-bootstrapped

- Push a `v0.1.0` tag at the pre-automation commit, so the release guard can't
  retroactively "release" it.
- Ensure the PR introducing the release workflow carries a changeset, so the first
  push to `main` opens a release PR rather than releasing.
- Create the `no-changeset` label.
- Enable *Allow GitHub Actions to create and approve pull requests* at the
  organisation level as well as the repository level.

For local changelog previews, `@changesets/changelog-github` needs a token:
`echo 'GITHUB_TOKEN=<token>' >> .env` (gitignored).
