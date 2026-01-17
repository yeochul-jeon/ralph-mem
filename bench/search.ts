/**
 * Search Performance Benchmark
 *
 * Tests:
 * - FTS search performance with varying data sizes
 * - Search with 1000 observations
 *
 * Performance target: < 200ms
 */

import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DBClient, createDBClient } from "../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../src/core/db/paths";
import { createSearchEngine } from "../src/core/search";
import { type MemoryStore, createMemoryStore } from "../src/core/store";

interface BenchmarkResult {
	name: string;
	observations: number;
	avgMs: number;
	minMs: number;
	maxMs: number;
	passed: boolean;
}

const TARGET_MS = 200; // Target: < 200ms

async function setupBenchmark(observationCount: number): Promise<{
	testDir: string;
	client: DBClient;
	store: MemoryStore;
	sessionId: string;
}> {
	const testDir = join(tmpdir(), `ralph-bench-search-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	ensureProjectDirs(testDir);

	const client = createDBClient(getProjectDBPath(testDir));
	const store = createMemoryStore(client);
	const session = store.createSession(testDir);
	const sessionId = session.id;

	// Generate test data
	console.log(`  Generating ${observationCount} observations...`);
	const topics = [
		"authentication",
		"database",
		"API endpoint",
		"React component",
		"TypeScript type",
		"error handling",
		"performance",
		"security",
		"testing",
		"deployment",
	];
	const actions = ["created", "updated", "fixed", "refactored", "optimized"];

	for (let i = 0; i < observationCount; i++) {
		const topic = topics[i % topics.length];
		const action = actions[i % actions.length];
		const content = `${action} ${topic} implementation for feature ${Math.floor(i / 10)}. This is observation number ${i} with additional context about ${topic} and related components.`;

		client.createObservation({
			session_id: sessionId,
			type: i % 3 === 0 ? "tool_use" : "note",
			content,
			tool_name: i % 3 === 0 ? "Write" : undefined,
		});
	}

	return { testDir, client, store, sessionId };
}

function cleanup(testDir: string, store: MemoryStore): void {
	store.close();
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true });
	}
}

async function benchmarkSearch(
	observationCount: number,
	iterations = 10,
): Promise<BenchmarkResult> {
	const { testDir, client, store, sessionId } =
		await setupBenchmark(observationCount);

	try {
		const searchEngine = createSearchEngine(client);
		const queries = [
			"authentication",
			"database API",
			"React component implementation",
			"error handling",
			"performance optimization",
		];

		const times: number[] = [];

		for (let i = 0; i < iterations; i++) {
			const query = queries[i % queries.length];
			const start = performance.now();
			searchEngine.search(query, { limit: 10, layer: 3 });
			const elapsed = performance.now() - start;
			times.push(elapsed);
		}

		const avg = times.reduce((a, b) => a + b, 0) / times.length;
		const min = Math.min(...times);
		const max = Math.max(...times);

		return {
			name: `Search (${observationCount} observations)`,
			observations: observationCount,
			avgMs: avg,
			minMs: min,
			maxMs: max,
			passed: avg < TARGET_MS,
		};
	} finally {
		cleanup(testDir, store);
	}
}

async function benchmarkDBSize(observationCount: number): Promise<{
	sizeMB: number;
	sizePerObservation: number;
}> {
	const { testDir, client, store, sessionId } =
		await setupBenchmark(observationCount);

	try {
		const dbPath = getProjectDBPath(testDir);
		const stats = statSync(dbPath);
		const sizeMB = stats.size / (1024 * 1024);
		const sizePerObservation = stats.size / observationCount;

		return { sizeMB, sizePerObservation };
	} finally {
		cleanup(testDir, store);
	}
}

async function main(): Promise<void> {
	console.log("🔍 Search Performance Benchmark\n");
	console.log(`Target: < ${TARGET_MS}ms\n`);

	const results: BenchmarkResult[] = [];

	// Benchmark with different sizes
	for (const count of [100, 500, 1000]) {
		console.log(`\n📊 Testing with ${count} observations...`);
		const result = await benchmarkSearch(count);
		results.push(result);
		console.log(`  Avg: ${result.avgMs.toFixed(2)}ms`);
		console.log(`  Min: ${result.minMs.toFixed(2)}ms`);
		console.log(`  Max: ${result.maxMs.toFixed(2)}ms`);
		console.log(`  ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);
	}

	// DB Size check
	console.log("\n\n📦 DB Size Benchmark (1000 observations)...");
	const dbSize = await benchmarkDBSize(1000);
	console.log(`  Total Size: ${dbSize.sizeMB.toFixed(2)} MB`);
	console.log(
		`  Per Observation: ${(dbSize.sizePerObservation / 1024).toFixed(2)} KB`,
	);
	console.log(
		`  Estimated 1000 sessions (100 obs each): ${((dbSize.sizeMB * 1000) / 10).toFixed(2)} MB`,
	);
	const dbPassed = (dbSize.sizeMB * 1000) / 10 < 100;
	console.log(`  ${dbPassed ? "✅ PASSED (< 100MB)" : "❌ FAILED (>= 100MB)"}`);

	// Summary
	console.log("\n\n📋 Summary\n");
	console.log("| Test | Observations | Avg (ms) | Status |");
	console.log("|------|--------------|----------|--------|");
	for (const result of results) {
		console.log(
			`| ${result.name} | ${result.observations} | ${result.avgMs.toFixed(2)} | ${result.passed ? "✅" : "❌"} |`,
		);
	}
	console.log(
		`| DB Size (est. 1000 sessions) | - | ${((dbSize.sizeMB * 1000) / 10).toFixed(2)} MB | ${dbPassed ? "✅" : "❌"} |`,
	);

	const allPassed = results.every((r) => r.passed) && dbPassed;
	console.log(
		`\n${allPassed ? "✅ All benchmarks passed!" : "❌ Some benchmarks failed"}`,
	);

	process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
