/**
 * Ambient typings for the Neuroglancer modules that ship without declarations.
 *
 * `neuroglancer@2.41.2` emits a `.d.ts` next to most of `lib/`, but not for
 * `lib/layer/image/index.js`, so importing `ImageUserLayer` is a TS7016 error
 * ("implicitly has an 'any' type"). Only the surface the wrapper actually uses
 * is declared here; the real class has many more members, all inherited from
 * `UserLayer` as far as this file is concerned.
 *
 * Delete this once a Neuroglancer release ships the declaration itself — an
 * ambient module declaration shadows the package's own typings rather than
 * merging with them, so keeping it would hide the real ones.
 */
declare module "neuroglancer/unstable/layer/image/index.js" {
	import { UserLayer } from "neuroglancer/unstable/layer/index.js";

	export class ImageUserLayer extends UserLayer {}
}
