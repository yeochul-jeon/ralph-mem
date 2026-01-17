import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import { createLoopEngine } from "../../src/features/ralph/engine";
import {
	type LoopHistoryEntry,
	type RalphContext,
	createRalphSkill,
	executeRalphCommand,
	formatHistoryMessage,
	formatStatusMessage,
} from "../../src/skills/ralph";

describe("Ralph Status Command", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-status-test-${Date.now()}`);
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

	describe("formatStatusMessage", () => {
		it("should format message when no loop running", () => {
			const message = formatStatusMessage(false);

			expect(message).toContain("실행 중인 Loop 없음");
			expect(message).toContain("/ralph start");
		});

		it("should format message when loop is running", () => {
			const message = formatStatusMessage(true, {
				id: "loop-abc123",
				task: "Fix tests",
				iterations: 3,
				maxIterations: 10,
				startedAt: new Date(Date.now() - 65000), // 1 min 5 sec ago
			});

			expect(message).toContain("📊 Ralph Loop 상태: 실행 중");
			expect(message).toContain("Loop ID: loop-abc123");
			expect(message).toContain("태스크: Fix tests");
			expect(message).toContain("반복: 3/10");
			expect(message).toContain("1분");
			expect(message).toContain("/ralph stop");
		});
	});

	describe("formatHistoryMessage", () => {
		it("should format empty history", () => {
			const message = formatHistoryMessage([]);

			expect(message).toContain("이력 없음");
		});

		it("should format history with entries", () => {
			const history: LoopHistoryEntry[] = [
				{
					id: "loop-abc123",
					task: "JWT 인증 구현",
					status: "success",
					iterations: 3,
					startedAt: new Date(),
				},
				{
					id: "loop-def456",
					task: "테스트 추가",
					status: "failed",
					iterations: 10,
					startedAt: new Date(),
				},
			];

			const message = formatHistoryMessage(history);

			expect(message).toContain("📋 최근 Ralph Loop 이력");
			expect(message).toContain("loop-abc123");
			expect(message).toContain("JWT 인증 구현");
			expect(message).toContain("success");
			expect(message).toContain("loop-def456");
			expect(message).toContain("테스트 추가");
			expect(message).toContain("failed");
		});

		it("should truncate long task names", () => {
			const history: LoopHistoryEntry[] = [
				{
					id: "loop-abc123",
					task: "This is a very long task name that should be truncated",
					status: "success",
					iterations: 5,
					startedAt: new Date(),
				},
			];

			const message = formatHistoryMessage(history);

			expect(message).toContain("This is a very lo...");
		});
	});

	describe("createRalphSkill.status", () => {
		it("should return no loop status when idle", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};
			const skill = createRalphSkill(context);

			const result = await skill.status();

			expect(result.isRunning).toBe(false);
			expect(result.message).toContain("실행 중인 Loop 없음");

			skill.close();
		});

		it("should return running status", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));
			const startPromise = engine.start("Status test", {
				maxIterations: 100,
				cooldownMs: 500,
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
				engine,
			};
			const skill = createRalphSkill(context);

			const result = await skill.status();

			expect(result.isRunning).toBe(true);
			expect(result.currentRun).toBeDefined();
			expect(result.currentRun?.task).toBe("Status test");
			expect(result.message).toContain("실행 중");

			await engine.stop();
			await startPromise;
			skill.close();
		});

		it("should return history when requested", async () => {
			// Create some loop history
			client.createLoopRun({
				session_id: sessionId,
				task: "First task",
				criteria: "test_pass",
				max_iterations: 10,
			});
			client.createLoopRun({
				session_id: sessionId,
				task: "Second task",
				criteria: "build_success",
				max_iterations: 5,
			});

			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};
			const skill = createRalphSkill(context);

			const result = await skill.status({ history: true });

			expect(result.history).toBeDefined();
			expect(result.history?.length).toBe(2);
			expect(result.message).toContain("최근 Ralph Loop 이력");

			skill.close();
		});

		it("should return empty history when no client", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
			};
			const skill = createRalphSkill(context);

			const result = await skill.status({ history: true });

			expect(result.history).toBeUndefined();

			skill.close();
		});
	});

	describe("executeRalphCommand status", () => {
		it("should handle status command", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand("status", "", context);

			expect(result).toContain("📊 Ralph Loop 상태");
		});

		it("should handle status --history command", async () => {
			// Create some loop history
			client.createLoopRun({
				session_id: sessionId,
				task: "Test task",
				criteria: "test_pass",
				max_iterations: 10,
			});

			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand("status", "--history", context);

			expect(result).toContain("📋 최근 Ralph Loop 이력");
			expect(result).toContain("Test task");
		});

		it("should show running loop in status", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));
			const startPromise = engine.start("Running task", {
				maxIterations: 100,
				cooldownMs: 500,
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
				engine,
			};

			const result = await executeRalphCommand("status", "", context);

			expect(result).toContain("실행 중");
			expect(result).toContain("Running task");

			await engine.stop();
			await startPromise;
		});
	});

	describe("DBClient.listLoopRuns", () => {
		it("should list loop runs for session", () => {
			client.createLoopRun({
				session_id: sessionId,
				task: "Task 1",
				criteria: "test_pass",
				max_iterations: 10,
			});
			client.createLoopRun({
				session_id: sessionId,
				task: "Task 2",
				criteria: "build_success",
				max_iterations: 5,
			});

			const runs = client.listLoopRuns(sessionId);

			expect(runs.length).toBe(2);
			// Check both tasks are present
			const tasks = runs.map((r) => r.task);
			expect(tasks).toContain("Task 1");
			expect(tasks).toContain("Task 2");
		});

		it("should respect limit", () => {
			for (let i = 0; i < 5; i++) {
				client.createLoopRun({
					session_id: sessionId,
					task: `Task ${i}`,
					criteria: "test_pass",
					max_iterations: 10,
				});
			}

			const runs = client.listLoopRuns(sessionId, 3);

			expect(runs.length).toBe(3);
		});

		it("should return empty array for no runs", () => {
			const runs = client.listLoopRuns(sessionId);

			expect(runs).toEqual([]);
		});
	});
});
