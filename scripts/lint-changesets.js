/**
 * Every changeset body must open with one of four bold change tags, and may only
 * name the one released package.
 *
 * This can't be a custom changelog module: changesets buckets the changelog by
 * semver type and `getReleaseLine` controls one bullet, not the headings above it.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TAGS = ["**Breaking:**", "**Added:**", "**Changed:**", "**Fixed:**"];
const RELEASED_PACKAGE = "@scalableminds/ocean-viewer";
const CHANGESET_DIR = path.resolve(import.meta.dirname, "..", ".changeset");

const FRONTMATTER = /^\s*---\r?\n([\s\S]*?)\r?\n\s*---([\s\S]*)$/;

let entries;
try {
	entries = await readdir(CHANGESET_DIR);
} catch (err) {
	if (err.code === "ENOENT") {
		console.log("No .changeset directory — nothing to lint.");
		process.exit(0);
	}
	throw err;
}

const files = entries
	.filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md")
	.sort();

const errors = [];

for (const file of files) {
	const raw = await readFile(path.join(CHANGESET_DIR, file), "utf8");
	const match = FRONTMATTER.exec(raw);

	if (match === null) {
		errors.push(`${file}: missing or malformed \`---\` frontmatter.`);
		continue;
	}

	const [, frontmatter, rest] = match;

	for (const line of frontmatter.split("\n")) {
		const named = /^\s*"?([^":]+)"?\s*:/.exec(line);
		if (named !== null && named[1].trim() !== RELEASED_PACKAGE) {
			errors.push(
				`${file}: names "${named[1].trim()}", but only ${RELEASED_PACKAGE} is released.`,
			);
		}
	}

	const body = rest.trim();
	// `changeset add --empty` deliberately produces no body.
	if (body === "") {
		continue;
	}

	const firstLine = body.split("\n")[0].trim();
	if (!TAGS.some((tag) => firstLine.startsWith(tag))) {
		errors.push(
			`${file}: body must start with one of ${TAGS.join(" ")}\n` +
				`      found: ${JSON.stringify(firstLine.slice(0, 80))}`,
		);
	}
}

if (errors.length > 0) {
	console.error("Invalid changeset(s) in .changeset/:\n");
	for (const message of errors) {
		console.error(`  - ${message}`);
	}
	console.error("\nSee CONTRIBUTING.md for which tag to use.");
	process.exit(1);
}

console.log(`Checked ${files.length} changeset(s): all bodies are tagged.`);
