#!/usr/bin/env bun
/**
 * Build script for ralph-mem plugin
 *
 * Builds all entry points:
 * - src/index.ts -> dist/index.js
 * - src/hooks/*.ts -> dist/hooks/*.js
 * - src/skills/*.ts -> dist/skills/*.js
 */

import { Glob, file, write } from "bun";

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

// Post-process: Remove duplicate exports (Bun 1.3.5 bug workaround)
const jsFiles = [...new Glob("dist/**/*.js").scanSync(".")];
let fixedCount = 0;

for (const jsFile of jsFiles) {
	const content = await file(jsFile).text();
	const lines = content.split("\n");

	// Find all export lines and track exports
	const seenExports = new Set<string>();
	const filteredLines: string[] = [];
	let inExportBlock = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Track multi-line export block start
		if (trimmed.match(/^export\s*\{/) && !trimmed.includes("};")) {
			inExportBlock = true;
			filteredLines.push(line);
			// Extract any exports on the same line as opening brace
			const sameLineExports = trimmed.match(/export\s*\{\s*(.+)/);
			if (sameLineExports) {
				const exports = sameLineExports[1].split(",").map((e) => e.trim());
				for (const exp of exports) {
					if (exp && exp !== "{") seenExports.add(exp);
				}
			}
			continue;
		}

		// Track exports inside multi-line block
		if (inExportBlock) {
			// Check for closing brace
			if (trimmed.includes("}")) {
				inExportBlock = false;
			}
			// Extract export names (handles "name" or "name,")
			const exportNames = trimmed
				.replace(/[{};]/g, "")
				.split(",")
				.map((e) => e.trim())
				.filter((e) => e);
			for (const name of exportNames) {
				seenExports.add(name);
			}
			filteredLines.push(line);
			continue;
		}

		// Match single-line export like: export { foo };
		const singleExportMatch = trimmed.match(/^export\s*\{\s*(\w+)\s*\};$/);
		if (singleExportMatch) {
			const exportName = singleExportMatch[1];
			if (seenExports.has(exportName)) {
				// Skip duplicate
				continue;
			}
			seenExports.add(exportName);
		}

		filteredLines.push(line);
	}

	const newContent = filteredLines.join("\n");
	if (newContent !== content) {
		await write(jsFile, newContent);
		fixedCount++;
	}
}

if (fixedCount > 0) {
	console.log(`Fixed duplicate exports in ${fixedCount} files`);
}

console.log(`\nBuild complete: ${result.outputs.length} files`);
