import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import { createLoopEngine } from "../../src/features/ralph/engine";
import {
	type RalphContext,
	type RalphStartArgs,
	createRalphSkill,
	executeRalphCommand,
	formatStartMessage,
	formatStatusMessage,
	formatStopMessage,
	parseStartArgs,
} from "../../src/skills/ralph";

describe("Ralph Start Command", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-ralph-test-${Date.now()}`);
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

	describe("parseStartArgs", () => {
		it("should parse simple task", () => {
			const args = parseStartArgs("Fix the tests");

			expect(args.task).toBe("Fix");
		});

		it("should parse quoted task", () => {
			const args = parseStartArgs('"Add JWT authentication"');

			expect(args.task).toBe("Add JWT authentication");
		});

		it("should parse single-quoted task", () => {
			const args = parseStartArgs("'Implement user login'");

			expect(args.task).toBe("Implement user login");
		});

		it("should parse --criteria option", () => {
			const args = parseStartArgs('"Test task" --criteria build_success');

			expect(args.task).toBe("Test task");
			expect(args.criteria).toBe("build_success");
		});

		it("should parse --max-iterations option", () => {
			const args = parseStartArgs('"Test task" --max-iterations 5');

			expect(args.task).toBe("Test task");
			expect(args.maxIterations).toBe(5);
		});

		it("should parse --cooldown option", () => {
			const args = parseStartArgs('"Test task" --cooldown 2000');

			expect(args.task).toBe("Test task");
			expect(args.cooldownMs).toBe(2000);
		});

		it("should parse --no-snapshot flag", () => {
			const args = parseStartArgs('"Test task" --no-snapshot');

			expect(args.task).toBe("Test task");
			expect(args.noSnapshot).toBe(true);
		});

		it("should parse multiple options", () => {
			const args = parseStartArgs(
				'"Complex task" --criteria type_check --max-iterations 20 --no-snapshot',
			);

			expect(args.task).toBe("Complex task");
			expect(args.criteria).toBe("type_check");
			expect(args.maxIterations).toBe(20);
			expect(args.noSnapshot).toBe(true);
		});

		it("should ignore invalid criteria type", () => {
			const args = parseStartArgs('"Test" --criteria invalid_type');

			expect(args.task).toBe("Test");
			expect(args.criteria).toBeUndefined();
		});

		it("should handle empty input", () => {
			const args = parseStartArgs("");

			expect(args.task).toBe("");
		});
	});

	describe("formatStartMessage", () => {
		it("should format start message correctly", () => {
			const message = formatStartMessage(
				"loop-abc123",
				"Add user authentication",
				"test_pass",
				10,
			);

			expect(message).toContain("🚀 Ralph Loop 시작");
			expect(message).toContain("태스크: Add user authentication");
			expect(message).toContain("기준: test_pass");
			expect(message).toContain("최대 반복: 10");
			expect(message).toContain("Loop ID: loop-abc123");
			expect(message).toContain("/ralph stop");
		});

		it("should include command for criteria", () => {
			const message = formatStartMessage(
				"loop-123",
				"Task",
				"build_success",
				5,
			);

			expect(message).toContain("npm run build");
		});
	});

	describe("formatStopMessage", () => {
		it("should format stop message without rollback", () => {
			const message = formatStopMessage("loop-abc123", "사용자 중단", false);

			expect(message).toContain("⏹️ Ralph Loop 중단");
			expect(message).toContain("Loop ID: loop-abc123");
			expect(message).toContain("이유: 사용자 중단");
			expect(message).not.toContain("롤백");
		});

		it("should include rollback info when rolled back", () => {
			const message = formatStopMessage("loop-abc123", "사용자 중단", true);

			expect(message).toContain("파일이 롤백되었습니다");
		});
	});

	describe("formatStatusMessage", () => {
		it("should format message when no loop running", () => {
			const message = formatStatusMessage(false);

			expect(message).toContain("실행 중인 Loop 없음");
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
		});
	});

	describe("createRalphSkill", () => {
		it("should create skill instance", () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const skill = createRalphSkill(context);

			expect(skill).toBeDefined();
			expect(typeof skill.start).toBe("function");
			expect(typeof skill.stop).toBe("function");
			expect(typeof skill.status).toBe("function");
			expect(typeof skill.close).toBe("function");

			skill.close();
		});

		describe("start", () => {
			it("should require task", async () => {
				const context: RalphContext = {
					projectPath: testDir,
					sessionId,
					client,
				};
				const skill = createRalphSkill(context);

				const result = await skill.start({ task: "" });

				expect(result.success).toBe(false);
				expect(result.error).toContain("태스크 설명이 필요합니다");

				skill.close();
			});

			it("should return start message on success", async () => {
				const context: RalphContext = {
					projectPath: testDir,
					sessionId,
					client,
				};
				const skill = createRalphSkill(context);

				const result = await skill.start({ task: "Test task" });

				expect(result.success).toBe(true);
				expect(result.message).toContain("🚀 Ralph Loop 시작");
				expect(result.message).toContain("Test task");

				skill.close();
			});

			it("should use default criteria when not specified", async () => {
				const context: RalphContext = {
					projectPath: testDir,
					sessionId,
					client,
				};
				const skill = createRalphSkill(context);

				const result = await skill.start({ task: "Test task" });

				expect(result.message).toContain("test_pass");

				skill.close();
			});

			it("should use specified criteria", async () => {
				const context: RalphContext = {
					projectPath: testDir,
					sessionId,
					client,
				};
				const skill = createRalphSkill(context);

				const result = await skill.start({
					task: "Build task",
					criteria: "build_success",
				});

				expect(result.message).toContain("build_success");

				skill.close();
			});

			it("should prevent concurrent loops", async () => {
				const engine = createLoopEngine(testDir, sessionId, { client });

				// Start a loop
				engine.onIteration(async () => ({ success: false }));
				const startPromise = engine.start("First task", {
					maxIterations: 100,
					cooldownMs: 1000,
				});

				// Try to start another via skill while first is running
				const context: RalphContext = {
					projectPath: testDir,
					sessionId,
					client,
					engine,
				};
				const skill = createRalphSkill(context);

				const result = await skill.start({ task: "Second task" });

				expect(result.success).toBe(false);
				expect(result.error).toContain("이미 Loop가 실행 중");

				// Stop the loop
				await engine.stop();
				await startPromise;
				skill.close();
			});
		});

		describe("stop", () => {
			it("should fail when no loop running", async () => {
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

				engine.onIteration(async () => ({ success: false }));
				const startPromise = engine.start("Test task", {
					maxIterations: 100,
					cooldownMs: 500,
				});

				// Wait a bit for loop to start
				await new Promise((resolve) => setTimeout(resolve, 50));

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

				await startPromise;
				skill.close();
			});
		});

		describe("status", () => {
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
		});
	});

	describe("executeRalphCommand", () => {
		it("should execute start command", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand("start", '"Add tests"', context);

			expect(result).toContain("🚀 Ralph Loop 시작");
		});

		it("should execute stop command", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand("stop", "", context);

			expect(result).toContain("❌");
			expect(result).toContain("실행 중인 Loop가 없습니다");
		});

		it("should execute status command", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand("status", "", context);

			expect(result).toContain("📊 Ralph Loop 상태");
		});

		it("should handle unknown command", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand("unknown", "", context);

			expect(result).toContain("❌ 알 수 없는 명령");
			expect(result).toContain("사용 가능한 명령");
		});

		it("should handle start with options", async () => {
			const context: RalphContext = {
				projectPath: testDir,
				sessionId,
				client,
			};

			const result = await executeRalphCommand(
				"start",
				'"Build app" --criteria build_success --max-iterations 5',
				context,
			);

			expect(result).toContain("build_success");
			expect(result).toContain("최대 반복: 5");
		});
	});
});
