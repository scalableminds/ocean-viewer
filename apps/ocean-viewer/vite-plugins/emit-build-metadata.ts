import type { Plugin } from "vite";

export interface BuildMetadataOptions {
	name: string;
	version: string;
}

/**
 * Emits an unhashed `dist/version.json`, so an operator can answer "which build
 * is on this server?" with one GET.
 *
 * `builtAt` honours SOURCE_DATE_EPOCH so rebuilding a tag stays byte-identical.
 */
export function emitBuildMetadata({
	name,
	version,
}: BuildMetadataOptions): Plugin {
	return {
		name: "ocean-viewer:emit-build-metadata",
		apply: "build",
		generateBundle() {
			const epoch = process.env.SOURCE_DATE_EPOCH;
			const builtAt = new Date(
				epoch === undefined ? Date.now() : Number(epoch) * 1000,
			).toISOString();

			this.emitFile({
				type: "asset",
				fileName: "version.json",
				source: `${JSON.stringify(
					{
						name,
						version,
						commit: process.env.GITHUB_SHA ?? "unknown",
						builtAt,
					},
					null,
					2,
				)}\n`,
			});
		},
	};
}
