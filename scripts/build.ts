#!/usr/bin/env bun
/**
 * Build script for ralph-mem plugin
 *
 * Builds all entry points:
 * - src/index.ts -> dist/index.js
 * - src/hooks/*.ts -> dist/hooks/*.js
 * - src/skills/*.ts -> dist/skills/*.js
 */

import { Glob } from "bun";

const entryPoints = [
	"src/index.ts",
	...new Glob("src/hooks/*.ts").scanSync("."),
	...new Glob("src/skills/*.ts").scanSync("."),
];

console.log("Building entry points:");
for (const entry of entryPoints) {
	console.log(`  - ${entry}`);
}

const result = await Bun.build({
	entrypoints: entryPoints,
	outdir: "dist",
	target: "node",
	splitting: true,
	format: "esm",
	root: "src",
});

if (!result.success) {
	console.error("Build failed:");
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

console.log(`\nBuild complete: ${result.outputs.length} files`);
