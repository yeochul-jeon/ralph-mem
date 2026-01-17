import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import { createLoopEngine } from "../../src/features/ralph/engine";
import {
	type RalphContext,
	createRalphSkill,
	executeRalphCommand,
	formatStopMessage,
} from "../../src/skills/ralph";

describe("Ralph Stop Command", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-stop-test-${Date.now()}`);
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

	describe("formatStopMessage", () => {
		it("should format message without rollback", () => {
			const message = formatStopMessage("loop-abc123", "사용자 중단", false);

			expect(message).toContain("⏹️ Ralph Loop 중단");
			expect(message).toContain("Loop ID: loop-abc123");
			expect(message).toContain("이유: 사용자 중단");
			expect(message).not.toContain("롤백");
		});

		it("should format message with rollback", () => {
			const message = formatStopMessage("loop-abc123", "사용자 중단", true);

			expect(message).toContain("⏹️ Ralph Loop 중단");
			expect(message).toContain("파일이 롤백되었습니다");
		});

		it("should include different reasons", () => {
			const reasons = ["사용자 중단", "최대 반복 도달", "성공"];

			for (const reason of reasons) {
				const message = formatStopMessage("loop-123", reason, false);
				expect(message).toContain(`이유: ${reason}`);
			}
		});
	});

	describe("createRalphSkill.stop", () => {
		it("should fail when no loop is running", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};
			const skill = createRalphSkill(context);

			const result = await skill.stop();

			expect(result.success).toBe(false);
			expect(result.error).toContain("실행 중인 Loop가 없습니다");

			skill.close();
		});

		it("should stop running loop", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			// Start a loop
			engine.onIteration(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return { success: false };
			});

			const startPromise = engine.start("Test task", {
				maxIterations: 100,
				cooldownMs: 100,
			});

			// Wait for loop to start
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(engine.isRunning()).toBe(true);

			// Stop via skill
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
				engine,
			};
			const skill = createRalphSkill(context);

			const result = await skill.stop();

			expect(result.success).toBe(true);
			expect(result.message).toContain("⏹️ Ralph Loop 중단");

			// Wait for loop to finish
			const loopResult = await startPromise;
			expect(loopResult.reason).toBe("stopped");

			skill.close();
		});

		it("should include loop ID in stop message", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));

			const startPromise = engine.start("ID test", {
				maxIterations: 100,
				cooldownMs: 500,
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const currentRun = engine.getCurrentRun();
			const loopId = currentRun?.id;

			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
				engine,
			};
			const skill = createRalphSkill(context);

			const result = await skill.stop();

			expect(result.message).toContain(`Loop ID: ${loopId}`);

			await startPromise;
			skill.close();
		});

		it("should update loop status to stopped", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));

			const startPromise = engine.start("Status test", {
				maxIterations: 100,
				cooldownMs: 500,
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const loopId = engine.getCurrentRun()?.id;

			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
				engine,
			};
			const skill = createRalphSkill(context);

			await skill.stop();
			await startPromise;

			// Check status in DB
			if (loopId) {
				const loopRun = client.getLoopRun(loopId);
				expect(loopRun?.status).toBe("stopped");
			}

			skill.close();
		});
	});

	describe("executeRalphCommand stop", () => {
		it("should handle stop command with no running loop", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand("stop", "", context);

			expect(result).toContain("❌");
			expect(result).toContain("실행 중인 Loop가 없습니다");
		});

		it("should stop running loop via command", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));

			const startPromise = engine.start("Command test", {
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

			const result = await executeRalphCommand("stop", "", context);

			expect(result).toContain("⏹️ Ralph Loop 중단");

			await startPromise;
		});

		it("should handle --rollback option", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));

			const startPromise = engine.start("Rollback test", {
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

			const result = await executeRalphCommand("stop", "--rollback", context);

			// Should still succeed even if no snapshot exists
			expect(result).toContain("⏹️ Ralph Loop 중단");

			await startPromise;
		});
	});

	describe("Integration: Start and Stop", () => {
		it("should start and stop a loop", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });
			let iterationCount = 0;

			engine.onIteration(async () => {
				iterationCount++;
				await new Promise((resolve) => setTimeout(resolve, 50));
				return { success: false };
			});

			// Start
			const startPromise = engine.start("Integration test", {
				maxIterations: 100,
				cooldownMs: 100,
			});

			// Wait for some iterations
			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(iterationCount).toBeGreaterThan(0);

			// Stop
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
				engine,
			};
			const skill = createRalphSkill(context);

			await skill.stop();

			const loopResult = await startPromise;

			expect(loopResult.success).toBe(false);
			expect(loopResult.reason).toBe("stopped");
			expect(loopResult.iterations).toBeGreaterThan(0);

			skill.close();
		});

		it("should not allow restart immediately after stop", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));

			const startPromise = engine.start("First task", {
				maxIterations: 100,
				cooldownMs: 500,
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			// Stop
			await engine.stop();
			await startPromise;

			// Now engine should not be running
			expect(engine.isRunning()).toBe(false);

			// Can start a new loop
			engine.onIteration(async () => ({ success: true }));
			const result = await engine.start("Second task", {
				maxIterations: 5,
				cooldownMs: 0,
			});

			expect(result.success).toBe(true);

			engine.close();
		});
	});
});
