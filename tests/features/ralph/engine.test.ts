import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DBClient, createDBClient } from "../../../src/core/db/client";
import {
	ensureProjectDirs,
	getProjectDBPath,
} from "../../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../../src/core/store";
import {
	type IterationContext,
	type LoopEngine,
	createLoopEngine,
} from "../../../src/features/ralph/engine";

describe("Loop Engine", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		ensureProjectDirs(testDir);
		client = createDBClient(getProjectDBPath(testDir));
		store = createMemoryStore(client);

		// Create a session for testing
		const session = store.createSession(testDir);
		sessionId = session.id;
	});

	afterEach(() => {
		store.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("Basic Loop", () => {
		it("should create loop run on start", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			// Set up a callback that succeeds on first iteration
			engine.onIteration(async () => ({ success: true }));

			const result = await engine.start("Test task");

			expect(result.loopRunId).toMatch(/^loop-/);
			expect(result.success).toBe(true);

			// Verify loop run in DB
			const loopRun = client.getLoopRun(result.loopRunId);
			expect(loopRun).toBeDefined();
			expect(loopRun?.task).toBe("Test task");
			expect(loopRun?.status).toBe("success");

			engine.close();
		});

		it("should call iteration callback", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			const iterations: number[] = [];

			engine.onIteration(async (ctx: IterationContext) => {
				iterations.push(ctx.iteration);
				// Succeed on 3rd iteration
				return { success: ctx.iteration >= 3 };
			});

			const result = await engine.start("Test task", {
				maxIterations: 10,
				cooldownMs: 0,
			});

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(3);
			expect(iterations).toEqual([1, 2, 3]);

			engine.close();
		});

		it("should pass task in iteration context", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			let receivedTask = "";

			engine.onIteration(async (ctx) => {
				receivedTask = ctx.task;
				return { success: true };
			});

			await engine.start("My specific task");

			expect(receivedTask).toBe("My specific task");

			engine.close();
		});

		it("should pass loopRunId in iteration context", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			let receivedLoopRunId = "";

			engine.onIteration(async (ctx) => {
				receivedLoopRunId = ctx.loopRunId;
				return { success: true };
			});

			const result = await engine.start("Test task");

			expect(receivedLoopRunId).toBe(result.loopRunId);

			engine.close();
		});
	});

	describe("Success and Failure", () => {
		it("should return success when criteria met", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: true }));

			const result = await engine.start("Test task");

			expect(result.success).toBe(true);
			expect(result.reason).toBe("success");

			engine.close();
		});

		it("should return max_iterations when limit reached", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: false }));

			const result = await engine.start("Test task", {
				maxIterations: 3,
				cooldownMs: 0,
			});

			expect(result.success).toBe(false);
			expect(result.reason).toBe("max_iterations");
			expect(result.iterations).toBe(3);

			engine.close();
		});

		it("should include error message on max iterations", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({
				success: false,
				error: "Test failed",
			}));

			const result = await engine.start("Test task", {
				maxIterations: 2,
				cooldownMs: 0,
			});

			expect(result.error).toBe("Test failed");

			engine.close();
		});

		it("should return error when callback throws", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => {
				throw new Error("Callback error");
			});

			const result = await engine.start("Test task");

			expect(result.success).toBe(false);
			expect(result.reason).toBe("error");
			expect(result.error).toContain("Callback error");

			engine.close();
		});
	});

	describe("Stop Control", () => {
		it("should stop when stop() is called", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			let iteration = 0;

			engine.onIteration(async () => {
				iteration++;
				// Stop after first iteration
				if (iteration === 1) {
					// Schedule stop (simulates external stop call)
					setTimeout(() => engine.stop(), 0);
				}
				// Never succeed naturally
				return { success: false };
			});

			const result = await engine.start("Test task", {
				maxIterations: 10,
				cooldownMs: 50, // Give time for stop to be processed
			});

			expect(result.success).toBe(false);
			expect(result.reason).toBe("stopped");

			engine.close();
		});

		it("should update status to stopped in DB", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => {
				await engine.stop();
				return { success: false };
			});

			const result = await engine.start("Test task", { cooldownMs: 0 });

			const loopRun = client.getLoopRun(result.loopRunId);
			expect(loopRun?.status).toBe("stopped");

			engine.close();
		});
	});

	describe("Concurrent Execution Prevention", () => {
		it("should throw error for concurrent execution", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			// Create an active loop run directly in DB
			const loopRun = client.createLoopRun({
				session_id: sessionId,
				task: "Existing task",
				criteria: "[]",
			});

			engine.onIteration(async () => ({ success: true }));

			await expect(engine.start("New task")).rejects.toThrow(
				/Loop already running/,
			);

			// Clean up
			client.updateLoopRun(loopRun.id, { status: "stopped" });
			engine.close();
		});
	});

	describe("State Management", () => {
		it("should report isRunning correctly", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			expect(engine.isRunning()).toBe(false);

			let wasRunningDuringIteration = false;

			engine.onIteration(async () => {
				wasRunningDuringIteration = engine.isRunning();
				return { success: true };
			});

			await engine.start("Test task");

			expect(wasRunningDuringIteration).toBe(true);
			// After completion, isRunning depends on status
			expect(engine.getCurrentRun()?.status).toBe("success");

			engine.close();
		});

		it("should return current run during execution", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			let runDuringIteration: ReturnType<LoopEngine["getCurrentRun"]> = null;

			engine.onIteration(async () => {
				runDuringIteration = engine.getCurrentRun();
				return { success: true };
			});

			await engine.start("Test task");

			expect(runDuringIteration).not.toBeNull();
			expect(runDuringIteration?.task).toBe("Test task");
			expect(runDuringIteration?.status).toBe("running");

			engine.close();
		});
	});

	describe("Callbacks", () => {
		it("should return error if no iteration callback set", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			const result = await engine.start("Test task");

			expect(result.success).toBe(false);
			expect(result.reason).toBe("error");
			expect(result.error).toContain("No iteration callback");

			engine.close();
		});

		it("should call complete callback on success", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			const completeMock = vi.fn();

			engine.onIteration(async () => ({ success: true }));
			engine.onComplete(completeMock);

			await engine.start("Test task");

			expect(completeMock).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					reason: "success",
				}),
			);

			engine.close();
		});

		it("should call complete callback on failure", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			const completeMock = vi.fn();

			engine.onIteration(async () => ({ success: false }));
			engine.onComplete(completeMock);

			await engine.start("Test task", { maxIterations: 1, cooldownMs: 0 });

			expect(completeMock).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					reason: "max_iterations",
				}),
			);

			engine.close();
		});

		it("should call complete callback on stop", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			const completeMock = vi.fn();

			engine.onIteration(async () => {
				await engine.stop();
				return { success: false };
			});
			engine.onComplete(completeMock);

			await engine.start("Test task", { cooldownMs: 0 });

			expect(completeMock).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					reason: "stopped",
				}),
			);

			engine.close();
		});
	});

	describe("Cooldown", () => {
		it("should apply cooldown between iterations", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			const timestamps: number[] = [];

			engine.onIteration(async (ctx) => {
				timestamps.push(Date.now());
				return { success: ctx.iteration >= 3 };
			});

			await engine.start("Test task", {
				maxIterations: 5,
				cooldownMs: 50,
			});

			// Check that at least some cooldown was applied
			if (timestamps.length >= 2) {
				const diff = timestamps[1] - timestamps[0];
				expect(diff).toBeGreaterThanOrEqual(40); // Allow some tolerance
			}

			engine.close();
		});

		it("should respect cooldownMs option", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async (ctx) => ({ success: ctx.iteration >= 2 }));

			const start = Date.now();
			await engine.start("Test task", {
				maxIterations: 5,
				cooldownMs: 100,
			});
			const duration = Date.now() - start;

			// Should have at least one cooldown period
			expect(duration).toBeGreaterThanOrEqual(80);

			engine.close();
		});
	});

	describe("Configuration", () => {
		it("should use config defaults", async () => {
			const engine = createLoopEngine(testDir, sessionId, {
				client,
				config: {
					ralph: {
						max_iterations: 5,
						cooldown_ms: 10,
						context_budget: 50000,
						success_criteria: [{ type: "test_pass" }],
					},
				},
			});

			engine.onIteration(async () => ({ success: false }));

			const result = await engine.start("Test task");

			expect(result.iterations).toBe(5);

			engine.close();
		});

		it("should allow option override", async () => {
			const engine = createLoopEngine(testDir, sessionId, {
				client,
				config: {
					ralph: {
						max_iterations: 10,
						cooldown_ms: 100,
						context_budget: 50000,
						success_criteria: [],
					},
				},
			});

			engine.onIteration(async () => ({ success: false }));

			const result = await engine.start("Test task", {
				maxIterations: 2,
				cooldownMs: 0,
			});

			expect(result.iterations).toBe(2);

			engine.close();
		});
	});

	describe("DB Persistence", () => {
		it("should update iterations in DB", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async (ctx) => ({ success: ctx.iteration >= 3 }));

			const result = await engine.start("Test task", { cooldownMs: 0 });

			const loopRun = client.getLoopRun(result.loopRunId);
			expect(loopRun?.iterations).toBe(3);

			engine.close();
		});

		it("should set ended_at on completion", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: true }));

			const result = await engine.start("Test task");

			const loopRun = client.getLoopRun(result.loopRunId);
			expect(loopRun?.ended_at).toBeDefined();

			engine.close();
		});

		it("should store criteria as JSON", async () => {
			const engine = createLoopEngine(testDir, sessionId, { client });

			engine.onIteration(async () => ({ success: true }));

			const result = await engine.start("Test task", {
				criteria: [{ type: "test_pass" }, { type: "build_success" }],
			});

			const loopRun = client.getLoopRun(result.loopRunId);
			const criteria = JSON.parse(loopRun?.criteria || "[]");
			expect(criteria).toHaveLength(2);
			expect(criteria[0].type).toBe("test_pass");

			engine.close();
		});
	});
});
