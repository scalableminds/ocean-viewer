---
"@scalableminds/ocean-viewer": major
---

**Breaking:** the viewer is now distributed as a versioned tarball attached to each
GitHub release, rather than something each host builds itself.

What the host page has to change: point the iframe at a pinned release instead of a
self-built bundle. Either
`npm i https://github.com/scalableminds/ocean-viewer/releases/download/v1.0.0/ocean-viewer-1.0.0.tgz`,
or extract the same tarball onto a static host and serve `dist/`. The README covers
both paths, plus the two hosting details that matter (`application/wasm` for `.wasm`,
and no SPA catch-all rewrite).

Nothing about the postMessage protocol changed, so existing `CONFIG` / `READY` /
`REPORT` / `CLICK` / `HOVER` handling keeps working as-is.

**Added:** `dist/version.json` reports the running build's `version`, `commit` and
`builtAt` at a fixed URL, so "which build is on this server?" is answerable without
devtools.
