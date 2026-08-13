/**
 * Prints the body of one `## <version>` section of a changesets CHANGELOG.md, to
 * feed `gh release create --notes-file`.
 *
 *   node scripts/changelog-section.js apps/ocean-viewer/CHANGELOG.md 1.0.0
 */

import { readFile } from "node:fs/promises";
import process from "node:process";

const [, , changelogPath, version] = process.argv;
if (changelogPath === undefined || version === undefined) {
	console.error(
		"usage: node scripts/changelog-section.js <CHANGELOG.md> <version>",
	);
	process.exit(1);
}

const lines = (await readFile(changelogPath, "utf8")).split("\n");
const start = lines.findIndex((line) => line.trim() === `## ${version}`);
if (start === -1) {
	console.error(`No "## ${version}" section found in ${changelogPath}`);
	process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
	if (lines[i].startsWith("## ")) {
		end = i;
		break;
	}
}

const section = lines
	.slice(start + 1, end)
	.join("\n")
	.trim();
// Empty notes would silently produce a contentless release.
if (section === "") {
	console.error(`The "## ${version}" section in ${changelogPath} is empty.`);
	process.exit(1);
}

process.stdout.write(`${section}\n`);
