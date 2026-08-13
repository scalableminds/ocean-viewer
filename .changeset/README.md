# Changesets

Unreleased changelog entries. Add one with:

```sh
npx changeset
```

Pick **`@scalableminds/ocean-viewer`** — the only released package. The other three
workspaces are in `ignore` in `config.json`.

Every body must open with one of `**Breaking:**`, `**Added:**`, `**Changed:**`,
`**Fixed:**`; `npm run lint:changesets` enforces it. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for what counts as breaking and why breaking
entries must say what the *host page* changes.
