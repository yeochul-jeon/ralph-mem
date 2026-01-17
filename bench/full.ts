/**
 * Full Performance Benchmark
 *
 * Runs all performance benchmarks and generates a report.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const benchDir = import.meta.dir;

interface BenchResult {
	name: string;
	passed: boolean;
	output: string;
}

async function runBenchmark(
	name: string,
	script: string,
): Promise<BenchResult> {
	return new Promise((resolve) => {
		const proc = spawn("bun", ["run", join(benchDir, script)], {
			cwd: join(benchDir, ".."),
			stdio: ["inherit", "pipe", "pipe"],
		});

		let output = "";

		proc.stdout?.on("data", (data) => {
			output += data.toString();
			process.stdout.write(data);
		});

		proc.stderr?.on("data", (data) => {
			output += data.toString();
			process.stderr.write(data);
		});

		proc.on("close", (code) => {
			resolve({
				name,
				passed: code === 0,
				output,
			});
		});
	});
}

async function main(): Promise<void> {
	console.log("🚀 Full Performance Benchmark Suite\n");
	console.log("=".repeat(60));

	const results: BenchResult[] = [];

	// Run search benchmark
	console.log("\n\n📍 Running Search Benchmark...\n");
	console.log("-".repeat(60));
	const searchResult = await runBenchmark("Search", "search.ts");
	results.push(searchResult);

	// Run hooks benchmark
	console.log("\n\n📍 Running Hooks Benchmark...\n");
	console.log("-".repeat(60));
	const hooksResult = await runBenchmark("Hooks", "hooks.ts");
	results.push(hooksResult);

	// Final Summary
	console.log(`\n\n${"=".repeat(60)}`);
	console.log("📋 Final Report\n");

	console.log("| Benchmark | Status |");
	console.log("|-----------|--------|");
	for (const result of results) {
		console.log(
			`| ${result.name} | ${result.passed ? "✅ PASSED" : "❌ FAILED"} |`,
		);
	}

	const allPassed = results.every((r) => r.passed);

	console.log(`\n${"=".repeat(60)}`);
	console.log(
		`\n${allPassed ? "✅ ALL BENCHMARKS PASSED!" : "❌ SOME BENCHMARKS FAILED"}`,
	);

	process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
