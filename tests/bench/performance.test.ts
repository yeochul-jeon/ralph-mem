/**
 * Performance Benchmark Tests
 *
 * Tests performance targets from PRD:
 * - Search response: < 200ms
 * - Hook execution overhead: < 50ms
 * - Session start memory injection: < 500ms
 * - DB size (1000 sessions): < 100MB
 */

import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { createSearchEngine } from "../../src/core/search";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import { postToolUseHook } from "../../src/hooks/post-tool-use";
import { sessionStartHook } from "../../src/hooks/session-start";
import { userPromptSubmitHook } from "../../src/hooks/user-prompt-submit";

describe("Performance Benchmarks", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-perf-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		ensureProjectDirs(testDir);
		client = createDBClient(getProjectDBPath(testDir));
		store = createMemoryStore(client);
		const session = store.createSession(testDir);
		sessionId = session.id;
	});

	afterEach(() => {
		store.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("Search Performance", () => {
		const TARGET_MS = 200;

		it("should search 100 observations in < 200ms", () => {
			// Create 100 observations
			for (let i = 0; i < 100; i++) {
				client.createObservation({
					session_id: sessionId,
					type: i % 3 === 0 ? "tool_use" : "note",
					content: `Test observation ${i} about authentication and database API endpoints with React components`,
					tool_name: i % 3 === 0 ? "Write" : undefined,
				});
			}

			const searchEngine = createSearchEngine(client);

			const times: number[] = [];
			for (let i = 0; i < 5; i++) {
				const start = performance.now();
				searchEngine.search("authentication API", { limit: 10, layer: 3 });
				times.push(performance.now() - start);
			}

			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			console.log(`  Search (100 obs): avg ${avg.toFixed(2)}ms`);

			expect(avg).toBeLessThan(TARGET_MS);
		});

		it("should search 500 observations in < 200ms", () => {
			// Create 500 observations
			for (let i = 0; i < 500; i++) {
				client.createObservation({
					session_id: sessionId,
					type: i % 3 === 0 ? "tool_use" : "note",
					content: `Test observation ${i} about authentication and database API endpoints with React components`,
					tool_name: i % 3 === 0 ? "Write" : undefined,
				});
			}

			const searchEngine = createSearchEngine(client);

			const times: number[] = [];
			for (let i = 0; i < 5; i++) {
				const start = performance.now();
				searchEngine.search("authentication API", { limit: 10, layer: 3 });
				times.push(performance.now() - start);
			}

			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			console.log(`  Search (500 obs): avg ${avg.toFixed(2)}ms`);

			expect(avg).toBeLessThan(TARGET_MS);
		});

		it("should search 1000 observations in < 200ms", () => {
			// Create 1000 observations
			for (let i = 0; i < 1000; i++) {
				client.createObservation({
					session_id: sessionId,
					type: i % 3 === 0 ? "tool_use" : "note",
					content: `Test observation ${i} about authentication and database API endpoints with React components`,
					tool_name: i % 3 === 0 ? "Write" : undefined,
				});
			}

			const searchEngine = createSearchEngine(client);

			const times: number[] = [];
			for (let i = 0; i < 5; i++) {
				const start = performance.now();
				searchEngine.search("authentication API", { limit: 10, layer: 3 });
				times.push(performance.now() - start);
			}

			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			console.log(`  Search (1000 obs): avg ${avg.toFixed(2)}ms`);

			expect(avg).toBeLessThan(TARGET_MS);
		});
	});

	describe("Hook Performance", () => {
		const TARGET_MS = 50;

		it("should execute PostToolUse hook in < 50ms", async () => {
			// Create some existing data
			for (let i = 0; i < 100; i++) {
				client.createObservation({
					session_id: sessionId,
					type: "note",
					content: `Existing observation ${i}`,
				});
			}

			const times: number[] = [];
			for (let i = 0; i < 10; i++) {
				const start = performance.now();
				await postToolUseHook(
					{
						toolName: "Write",
						toolInput: {
							file_path: `/test/file${i}.ts`,
							content: "export const x = 1;",
						},
						toolOutput: "File written successfully",
						sessionId,
						projectPath: testDir,
						success: true,
					},
					{ client },
				);
				times.push(performance.now() - start);
			}

			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			console.log(`  PostToolUse Hook: avg ${avg.toFixed(2)}ms`);

			expect(avg).toBeLessThan(TARGET_MS);
		});

		it("should execute UserPromptSubmit hook in < 50ms", async () => {
			// Create some existing data
			for (let i = 0; i < 100; i++) {
				client.createObservation({
					session_id: sessionId,
					type: "note",
					content: `Existing observation ${i} about authentication`,
				});
			}

			const engine = createSearchEngine(client);

			const times: number[] = [];
			for (let i = 0; i < 10; i++) {
				const start = performance.now();
				await userPromptSubmitHook(
					{
						prompt: "How does authentication work?",
						sessionId,
						projectPath: testDir,
					},
					{ client, engine },
				);
				times.push(performance.now() - start);
			}

			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			console.log(`  UserPromptSubmit Hook: avg ${avg.toFixed(2)}ms`);

			expect(avg).toBeLessThan(TARGET_MS);
		});
	});

	describe("Session Start Performance", () => {
		const TARGET_MS = 500;

		it("should start session with memory injection in < 500ms", async () => {
			// Create some existing sessions with data
			for (let s = 0; s < 5; s++) {
				const oldSession = store.createSession(testDir);
				for (let i = 0; i < 50; i++) {
					client.createObservation({
						session_id: oldSession.id,
						type: "note",
						content: `Session ${s} observation ${i}`,
					});
				}
			}

			const times: number[] = [];
			for (let i = 0; i < 5; i++) {
				const start = performance.now();

				await sessionStartHook({ projectPath: testDir }, { client, store });

				times.push(performance.now() - start);
			}

			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			console.log(`  Session Start: avg ${avg.toFixed(2)}ms`);

			expect(avg).toBeLessThan(TARGET_MS);
		});
	});

	describe("DB Size", () => {
		it("should estimate DB size for 1000 sessions under 100MB", () => {
			// Create 10 sessions with 100 observations each (1000 total)
			for (let s = 0; s < 10; s++) {
				const session = store.createSession(testDir);
				for (let i = 0; i < 100; i++) {
					client.createObservation({
						session_id: session.id,
						type: i % 3 === 0 ? "tool_use" : "note",
						content: `Session ${s} observation ${i} with realistic content about authentication, database, and API endpoints. This is a typical observation that might be stored in a real session.`,
						tool_name: i % 3 === 0 ? "Write" : undefined,
					});
				}
			}

			const dbPath = getProjectDBPath(testDir);
			const stats = statSync(dbPath);
			const sizeMB = stats.size / (1024 * 1024);

			// Extrapolate to 1000 sessions (we have 10)
			const estimated1000SessionsMB = sizeMB * 100;

			console.log(
				`  Current DB size (10 sessions, 1000 obs): ${sizeMB.toFixed(2)} MB`,
			);
			console.log(
				`  Estimated 1000 sessions: ${estimated1000SessionsMB.toFixed(2)} MB`,
			);

			expect(estimated1000SessionsMB).toBeLessThan(100);
		});
	});
});
