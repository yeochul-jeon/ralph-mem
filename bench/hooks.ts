/**
 * Hooks Performance Benchmark
 *
 * Tests:
 * - PostToolUse hook execution overhead
 * - UserPromptSubmit hook execution overhead
 * - Session start memory injection time
 *
 * Performance targets:
 * - Hook execution: < 50ms
 * - Session start: < 500ms
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DBClient, createDBClient } from "../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../src/core/db/paths";
import { createSearchEngine } from "../src/core/search";
import { type MemoryStore, createMemoryStore } from "../src/core/store";
import {
	type PostToolUseContext,
	createPostToolUseHook,
} from "../src/hooks/post-tool-use";
import {
	type SessionStartContext,
	createSessionStartHook,
} from "../src/hooks/session-start";
import {
	type UserPromptSubmitContext,
	createUserPromptSubmitHook,
} from "../src/hooks/user-prompt-submit";

interface BenchmarkResult {
	name: string;
	avgMs: number;
	minMs: number;
	maxMs: number;
	target: number;
	passed: boolean;
}

const HOOK_TARGET_MS = 50;
const SESSION_START_TARGET_MS = 500;

async function setupBenchmark(observationCount = 100): Promise<{
	testDir: string;
	client: DBClient;
	store: MemoryStore;
	sessionId: string;
}> {
	const testDir = join(tmpdir(), `ralph-bench-hooks-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	ensureProjectDirs(testDir);

	const client = createDBClient(getProjectDBPath(testDir));
	const store = createMemoryStore(client);
	const session = store.createSession(testDir);
	const sessionId = session.id;

	// Generate test data
	for (let i = 0; i < observationCount; i++) {
		client.createObservation({
			session_id: sessionId,
			type: i % 3 === 0 ? "tool_use" : "note",
			content: `Test observation ${i} with content about authentication, database, and API endpoints.`,
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

async function benchmarkPostToolUse(iterations = 20): Promise<BenchmarkResult> {
	const { testDir, client, store, sessionId } = await setupBenchmark();

	try {
		const hook = createPostToolUseHook({
			sessionId,
			projectPath: testDir,
			client,
		});

		const times: number[] = [];

		for (let i = 0; i < iterations; i++) {
			const context: PostToolUseContext = {
				tool_name: "Write",
				tool_input: JSON.stringify({
					file_path: `/test/file${i}.ts`,
					content: "export const x = 1;",
				}),
				tool_output: "File written successfully",
				session_id: sessionId,
			};

			const start = performance.now();
			await hook.execute(context);
			const elapsed = performance.now() - start;
			times.push(elapsed);
		}

		const avg = times.reduce((a, b) => a + b, 0) / times.length;
		const min = Math.min(...times);
		const max = Math.max(...times);

		return {
			name: "PostToolUse Hook",
			avgMs: avg,
			minMs: min,
			maxMs: max,
			target: HOOK_TARGET_MS,
			passed: avg < HOOK_TARGET_MS,
		};
	} finally {
		cleanup(testDir, store);
	}
}

async function benchmarkUserPromptSubmit(
	iterations = 20,
): Promise<BenchmarkResult> {
	const { testDir, client, store, sessionId } = await setupBenchmark();

	try {
		const searchEngine = createSearchEngine(client);
		const hook = createUserPromptSubmitHook({
			sessionId,
			projectPath: testDir,
			client,
			searchEngine,
		});

		const times: number[] = [];
		const prompts = [
			"How does authentication work?",
			"Fix the database connection",
			"Add API endpoint",
			"Update the React component",
			"Handle the error case",
		];

		for (let i = 0; i < iterations; i++) {
			const context: UserPromptSubmitContext = {
				prompt: prompts[i % prompts.length],
				session_id: sessionId,
			};

			const start = performance.now();
			await hook.execute(context);
			const elapsed = performance.now() - start;
			times.push(elapsed);
		}

		const avg = times.reduce((a, b) => a + b, 0) / times.length;
		const min = Math.min(...times);
		const max = Math.max(...times);

		return {
			name: "UserPromptSubmit Hook",
			avgMs: avg,
			minMs: min,
			maxMs: max,
			target: HOOK_TARGET_MS,
			passed: avg < HOOK_TARGET_MS,
		};
	} finally {
		cleanup(testDir, store);
	}
}

async function benchmarkSessionStart(
	iterations = 10,
): Promise<BenchmarkResult> {
	const times: number[] = [];

	for (let i = 0; i < iterations; i++) {
		const testDir = join(tmpdir(), `ralph-bench-session-${Date.now()}-${i}`);
		mkdirSync(testDir, { recursive: true });
		ensureProjectDirs(testDir);

		const client = createDBClient(getProjectDBPath(testDir));
		const store = createMemoryStore(client);

		// Pre-populate with some existing sessions
		for (let j = 0; j < 10; j++) {
			const oldSession = store.createSession(testDir);
			for (let k = 0; k < 50; k++) {
				client.createObservation({
					session_id: oldSession.id,
					type: "note",
					content: `Old observation ${k}`,
				});
			}
		}

		// Measure session start with memory injection
		const searchEngine = createSearchEngine(client);
		const hook = createSessionStartHook({
			sessionId: "new-session-id",
			projectPath: testDir,
			client,
			searchEngine,
		});

		const start = performance.now();
		const session = store.createSession(testDir);
		await hook.execute({
			session_id: session.id,
			project_path: testDir,
		});
		const elapsed = performance.now() - start;
		times.push(elapsed);

		// Cleanup
		store.close();
		rmSync(testDir, { recursive: true });
	}

	const avg = times.reduce((a, b) => a + b, 0) / times.length;
	const min = Math.min(...times);
	const max = Math.max(...times);

	return {
		name: "Session Start (with memory injection)",
		avgMs: avg,
		minMs: min,
		maxMs: max,
		target: SESSION_START_TARGET_MS,
		passed: avg < SESSION_START_TARGET_MS,
	};
}

async function main(): Promise<void> {
	console.log("⚡ Hooks Performance Benchmark\n");

	const results: BenchmarkResult[] = [];

	// PostToolUse Hook
	console.log("📊 Benchmarking PostToolUse Hook...");
	const postToolResult = await benchmarkPostToolUse();
	results.push(postToolResult);
	console.log(
		`  Avg: ${postToolResult.avgMs.toFixed(2)}ms (target: < ${HOOK_TARGET_MS}ms)`,
	);
	console.log(`  ${postToolResult.passed ? "✅ PASSED" : "❌ FAILED"}`);

	// UserPromptSubmit Hook
	console.log("\n📊 Benchmarking UserPromptSubmit Hook...");
	const userPromptResult = await benchmarkUserPromptSubmit();
	results.push(userPromptResult);
	console.log(
		`  Avg: ${userPromptResult.avgMs.toFixed(2)}ms (target: < ${HOOK_TARGET_MS}ms)`,
	);
	console.log(`  ${userPromptResult.passed ? "✅ PASSED" : "❌ FAILED"}`);

	// Session Start
	console.log("\n📊 Benchmarking Session Start...");
	const sessionStartResult = await benchmarkSessionStart();
	results.push(sessionStartResult);
	console.log(
		`  Avg: ${sessionStartResult.avgMs.toFixed(2)}ms (target: < ${SESSION_START_TARGET_MS}ms)`,
	);
	console.log(`  ${sessionStartResult.passed ? "✅ PASSED" : "❌ FAILED"}`);

	// Summary
	console.log("\n\n📋 Summary\n");
	console.log("| Test | Avg (ms) | Target (ms) | Status |");
	console.log("|------|----------|-------------|--------|");
	for (const result of results) {
		console.log(
			`| ${result.name} | ${result.avgMs.toFixed(2)} | < ${result.target} | ${result.passed ? "✅" : "❌"} |`,
		);
	}

	const allPassed = results.every((r) => r.passed);
	console.log(
		`\n${allPassed ? "✅ All benchmarks passed!" : "❌ Some benchmarks failed"}`,
	);

	process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
