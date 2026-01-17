import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import {
	backupDatabase,
	formatSessionContext,
	sessionStartHook,
} from "../../src/hooks/session-start";

describe("SessionStart Hook", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		// Initialize DB in the test directory
		ensureProjectDirs(testDir);
		client = createDBClient(getProjectDBPath(testDir));
		store = createMemoryStore(client);
	});

	afterEach(() => {
		store.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("backupDatabase", () => {
		it("should create backup when DB exists", () => {
			// DB already created in beforeEach
			const backupPath = backupDatabase(testDir);

			expect(backupPath).toBeDefined();
			if (backupPath) {
				expect(existsSync(backupPath)).toBe(true);
			}
			expect(backupPath).toContain("backups");
			expect(backupPath).toContain("memory-");
		});

		it("should return undefined when DB does not exist", () => {
			const emptyDir = join(tmpdir(), `empty-${Date.now()}`);
			mkdirSync(emptyDir, { recursive: true });

			const backupPath = backupDatabase(emptyDir);

			expect(backupPath).toBeUndefined();

			rmSync(emptyDir, { recursive: true });
		});
	});

	describe("formatSessionContext", () => {
		it("should format sessions with summaries", () => {
			const sessions = [
				{ summary: "JWT 인증 구현 완료", started_at: "2025-01-15T10:00:00Z" },
				{ summary: "사용자 모델 정의", started_at: "2025-01-14T10:00:00Z" },
			];

			const result = formatSessionContext(sessions, 1000);

			expect(result.context).toContain("📝 이전 세션 컨텍스트:");
			expect(result.context).toContain("JWT 인증 구현 완료");
			expect(result.context).toContain("사용자 모델 정의");
			expect(result.tokenCount).toBeGreaterThan(0);
		});

		it("should return empty for no sessions", () => {
			const result = formatSessionContext([], 1000);

			expect(result.context).toBe("");
			expect(result.tokenCount).toBe(0);
		});

		it("should skip sessions without summary", () => {
			const sessions = [
				{ summary: null, started_at: "2025-01-15T10:00:00Z" },
				{ summary: "유효한 요약", started_at: "2025-01-14T10:00:00Z" },
			];

			const result = formatSessionContext(sessions, 1000);

			expect(result.context).toContain("유효한 요약");
			expect(result.context).not.toContain("null");
		});

		it("should respect token limit", () => {
			const sessions = [
				{ summary: "A".repeat(100), started_at: "2025-01-15T10:00:00Z" },
				{ summary: "B".repeat(100), started_at: "2025-01-14T10:00:00Z" },
				{ summary: "C".repeat(100), started_at: "2025-01-13T10:00:00Z" },
			];

			// Very small limit - should only include header
			const result = formatSessionContext(sessions, 10);

			expect(result.context).toBe("");
			expect(result.tokenCount).toBe(0);
		});
	});

	describe("sessionStartHook", () => {
		it("should create new session", async () => {
			const result = await sessionStartHook(
				{ projectPath: testDir },
				{ client, store },
			);

			expect(result.sessionId).toMatch(/^sess-/);
			expect(store.getCurrentSession()?.id).toBe(result.sessionId);
		});

		it("should inject previous session context", async () => {
			// Create previous session with summary
			const prevSession = store.createSession(testDir);
			store.endSession("이전 작업 완료");

			// Start new hook session
			const result = await sessionStartHook(
				{ projectPath: testDir },
				{ client, store },
			);

			expect(result.injectedContext).toContain("📝 이전 세션 컨텍스트:");
			expect(result.injectedContext).toContain("이전 작업 완료");
			expect(result.tokenCount).toBeGreaterThan(0);
		});

		it("should return empty context when no previous sessions", async () => {
			const result = await sessionStartHook(
				{ projectPath: testDir },
				{ client, store },
			);

			expect(result.injectedContext).toBe("");
			expect(result.tokenCount).toBe(0);
		});

		it("should return empty context when auto_inject is false", async () => {
			// Create previous session with summary
			store.createSession(testDir);
			store.endSession("이전 작업 완료");

			const result = await sessionStartHook(
				{ projectPath: testDir },
				{
					client,
					store,
					config: {
						memory: {
							auto_inject: false,
							max_inject_tokens: 2000,
							retention_days: 30,
						},
					},
				},
			);

			expect(result.injectedContext).toBe("");
			expect(result.tokenCount).toBe(0);
		});

		it("should respect max_inject_tokens limit", async () => {
			// Create multiple previous sessions
			for (let i = 0; i < 5; i++) {
				store.createSession(testDir);
				store.endSession(`작업 ${i}: ${"상세내용".repeat(20)}`);
			}

			const result = await sessionStartHook(
				{ projectPath: testDir },
				{
					client,
					store,
					config: {
						memory: {
							auto_inject: true,
							max_inject_tokens: 50,
							retention_days: 30,
						},
					},
				},
			);

			// Should be limited by token count
			expect(result.tokenCount).toBeLessThanOrEqual(50);
		});

		it("should return metadata with session count", async () => {
			store.createSession(testDir);
			store.endSession("첫 번째");
			store.createSession(testDir);
			store.endSession("두 번째");

			const result = await sessionStartHook(
				{ projectPath: testDir },
				{ client, store },
			);

			expect(result.metadata.previousSessions).toBe(2);
		});
	});
});
