import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import { generateSummary, sessionEndHook } from "../../src/hooks/session-end";

describe("SessionEnd Hook", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

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

	describe("generateSummary", () => {
		it("should generate summary from observations", () => {
			const observations = [
				{
					type: "tool_use" as const,
					tool_name: "Read",
					content: "file content",
				},
				{ type: "tool_use" as const, tool_name: "Edit", content: "edited" },
				{
					type: "tool_use" as const,
					tool_name: "Read",
					content: "another file",
				},
				{ type: "success" as const, tool_name: null, content: "tests passed" },
			];

			const result = generateSummary(observations);

			expect(result.summary).toContain("주요 도구");
			expect(result.summary).toContain("Read");
			expect(result.summary).toContain("성공");
			expect(result.toolStats.Read).toBe(2);
			expect(result.toolStats.Edit).toBe(1);
		});

		it("should handle empty observations", () => {
			const result = generateSummary([]);

			expect(result.summary).toBe("세션에서 기록된 작업이 없습니다.");
			expect(result.toolStats).toEqual({});
		});

		it("should include error count in summary", () => {
			const observations = [
				{ type: "error" as const, tool_name: null, content: "error 1" },
				{ type: "error" as const, tool_name: null, content: "error 2" },
			];

			const result = generateSummary(observations);

			expect(result.summary).toContain("에러 2건");
		});

		it("should include last note preview", () => {
			const observations = [
				{ type: "note" as const, tool_name: null, content: "first note" },
				{
					type: "note" as const,
					tool_name: null,
					content: "last important note",
				},
			];

			const result = generateSummary(observations);

			expect(result.summary).toContain("마지막 메모");
			expect(result.summary).toContain("last important note");
		});

		it("should truncate long note content", () => {
			const longContent = "A".repeat(100);
			const observations = [
				{ type: "note" as const, tool_name: null, content: longContent },
			];

			const result = generateSummary(observations);

			expect(result.summary).toContain("...");
		});
	});

	describe("sessionEndHook", () => {
		it("should end session and generate summary", async () => {
			// Create a session with observations
			const session = store.createSession(testDir);
			store.addObservation({
				type: "tool_use",
				toolName: "Read",
				content: "file",
			});
			store.addObservation({ type: "success", content: "done" });

			const result = await sessionEndHook(
				{ sessionId: session.id, projectPath: testDir },
				{ client },
			);

			expect(result.summary).toBeDefined();
			expect(result.observationCount).toBe(2);

			// Verify session is ended in DB
			const endedSession = client.getSession(session.id);
			expect(endedSession?.ended_at).toBeDefined();
			expect(endedSession?.summary).toBe(result.summary);
		});

		it("should handle session with no observations", async () => {
			const session = store.createSession(testDir);

			const result = await sessionEndHook(
				{ sessionId: session.id, projectPath: testDir },
				{ client },
			);

			expect(result.summary).toBe("세션에서 기록된 작업이 없습니다.");
			expect(result.observationCount).toBe(0);
		});

		it("should handle non-existent session", async () => {
			const result = await sessionEndHook(
				{ sessionId: "sess-nonexistent", projectPath: testDir },
				{ client },
			);

			expect(result.summary).toBe("");
			expect(result.observationCount).toBe(0);
		});

		it("should handle already ended session", async () => {
			const session = store.createSession(testDir);
			store.addObservation({ type: "note", content: "test" });
			store.endSession("Already ended");

			const result = await sessionEndHook(
				{ sessionId: session.id, projectPath: testDir },
				{ client },
			);

			expect(result.summary).toBe("Already ended");
			expect(result.observationCount).toBe(0); // No new observations counted
		});

		it("should include reason in summary for non-user termination", async () => {
			const session = store.createSession(testDir);
			store.addObservation({ type: "note", content: "work in progress" });

			const result = await sessionEndHook(
				{ sessionId: session.id, projectPath: testDir, reason: "timeout" },
				{ client },
			);

			expect(result.summary).toContain("[timeout]");
		});

		it("should include reason for error termination", async () => {
			const session = store.createSession(testDir);
			store.addObservation({ type: "error", content: "something failed" });

			const result = await sessionEndHook(
				{ sessionId: session.id, projectPath: testDir, reason: "error" },
				{ client },
			);

			expect(result.summary).toContain("[error]");
		});

		it("should return tool stats", async () => {
			const session = store.createSession(testDir);
			store.addObservation({
				type: "tool_use",
				toolName: "Read",
				content: "1",
			});
			store.addObservation({
				type: "tool_use",
				toolName: "Read",
				content: "2",
			});
			store.addObservation({
				type: "tool_use",
				toolName: "Write",
				content: "3",
			});

			const result = await sessionEndHook(
				{ sessionId: session.id, projectPath: testDir },
				{ client },
			);

			expect(result.toolStats.Read).toBe(2);
			expect(result.toolStats.Write).toBe(1);
		});
	});
});
