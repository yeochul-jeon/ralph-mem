import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import {
	calculateImportance,
	formatOutput,
	getObservationType,
	maskSensitiveData,
	postToolUseHook,
	shouldExclude,
	shouldRecordTool,
} from "../../src/hooks/post-tool-use";

describe("PostToolUse Hook", () => {
	let testDir: string;
	let client: DBClient;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		ensureProjectDirs(testDir);
		client = createDBClient(getProjectDBPath(testDir));

		// Create a session for testing
		const session = client.createSession({ project_path: testDir });
		sessionId = session.id;
	});

	afterEach(() => {
		client.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("shouldRecordTool", () => {
		it("should record Edit tool", () => {
			expect(shouldRecordTool("Edit")).toBe(true);
		});

		it("should record Write tool", () => {
			expect(shouldRecordTool("Write")).toBe(true);
		});

		it("should record Bash tool", () => {
			expect(shouldRecordTool("Bash")).toBe(true);
		});

		it("should NOT record Read tool", () => {
			expect(shouldRecordTool("Read")).toBe(false);
		});

		it("should NOT record Glob tool", () => {
			expect(shouldRecordTool("Glob")).toBe(false);
		});

		it("should NOT record Grep tool", () => {
			expect(shouldRecordTool("Grep")).toBe(false);
		});

		it("should record unknown tools by default", () => {
			expect(shouldRecordTool("UnknownTool")).toBe(true);
		});
	});

	describe("getObservationType", () => {
		it("should return error for failed tools", () => {
			expect(getObservationType("Edit", false)).toBe("error");
			expect(getObservationType("Bash", false)).toBe("error");
		});

		it("should return bash for successful Bash", () => {
			expect(getObservationType("Bash", true)).toBe("bash");
		});

		it("should return tool_use for other successful tools", () => {
			expect(getObservationType("Edit", true)).toBe("tool_use");
			expect(getObservationType("Write", true)).toBe("tool_use");
		});
	});

	describe("calculateImportance", () => {
		it("should return 1.0 for errors", () => {
			const context = {
				toolName: "Edit",
				toolInput: {},
				toolOutput: "",
				sessionId: "",
				projectPath: "",
				success: false,
			};
			expect(calculateImportance(context)).toBe(1.0);
		});

		it("should return 0.9 for test results", () => {
			const context = {
				toolName: "Bash",
				toolInput: {},
				toolOutput: "Test Files  1 passed",
				sessionId: "",
				projectPath: "",
				success: true,
			};
			expect(calculateImportance(context)).toBe(0.9);
		});

		it("should return 0.7 for file modifications", () => {
			const context = {
				toolName: "Edit",
				toolInput: {},
				toolOutput: "File updated",
				sessionId: "",
				projectPath: "",
				success: true,
			};
			expect(calculateImportance(context)).toBe(0.7);
		});

		it("should return 0.5 for general commands", () => {
			const context = {
				toolName: "Bash",
				toolInput: {},
				toolOutput: "ls output",
				sessionId: "",
				projectPath: "",
				success: true,
			};
			expect(calculateImportance(context)).toBe(0.5);
		});
	});

	describe("formatOutput", () => {
		it("should return string as-is if short", () => {
			expect(formatOutput("hello")).toBe("hello");
		});

		it("should truncate long strings", () => {
			const longString = "A".repeat(3000);
			const result = formatOutput(longString, 2000);

			expect(result).toContain("... [truncated]");
			expect(result.length).toBeLessThan(3000);
		});

		it("should stringify objects", () => {
			const result = formatOutput({ foo: "bar" });
			expect(result).toBe('{"foo":"bar"}');
		});
	});

	describe("shouldExclude", () => {
		const patterns = ["*.env", "*.key", "*secret*", "*password*"];

		it("should exclude .env files", () => {
			expect(shouldExclude("Reading .env file", patterns)).toBe(true);
		});

		it("should exclude content with secret", () => {
			expect(shouldExclude("API_SECRET=abc123", patterns)).toBe(true);
		});

		it("should exclude content with password", () => {
			expect(shouldExclude("password=hidden", patterns)).toBe(true);
		});

		it("should NOT exclude normal content", () => {
			expect(shouldExclude("Hello world", patterns)).toBe(false);
		});
	});

	describe("maskSensitiveData", () => {
		it("should mask API keys", () => {
			const content = "api_key = sk-proj-abcdefghij123456789012345";
			const masked = maskSensitiveData(content);

			expect(masked).not.toContain("sk-proj-abcdefghij123456789012345");
			expect(masked).toContain("[MASKED]");
		});

		it("should mask Bearer tokens", () => {
			const content =
				"Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
			const masked = maskSensitiveData(content);

			expect(masked).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
			expect(masked).toContain("Bearer [MASKED]");
		});

		it("should mask environment variables with sensitive names", () => {
			const content = "DATABASE_PASSWORD=verysecret123";
			const masked = maskSensitiveData(content);

			expect(masked).not.toContain("verysecret123");
		});

		it("should NOT mask normal content", () => {
			const content = "This is normal content";
			const masked = maskSensitiveData(content);

			expect(masked).toBe(content);
		});
	});

	describe("postToolUseHook", () => {
		it("should record Edit tool usage", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Edit",
					toolInput: { file_path: "test.ts" },
					toolOutput: "File updated successfully",
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.recorded).toBe(true);
			expect(result.observationId).toMatch(/^obs-/);
			expect(result.type).toBe("tool_use");
			expect(result.importance).toBe(0.7);
		});

		it("should record Bash tool as bash type", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Bash",
					toolInput: { command: "npm run build" },
					toolOutput: "Build successful",
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.recorded).toBe(true);
			expect(result.type).toBe("bash");
		});

		it("should record errors with type=error", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Bash",
					toolInput: { command: "npm test" },
					toolOutput: "",
					sessionId,
					projectPath: testDir,
					success: false,
					error: "Command failed with exit code 1",
				},
				{ client },
			);

			expect(result.recorded).toBe(true);
			expect(result.type).toBe("error");
			expect(result.importance).toBe(1.0);
		});

		it("should NOT record Read tool", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Read",
					toolInput: { file_path: "test.ts" },
					toolOutput: "file content",
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.recorded).toBe(false);
			expect(result.observationId).toBeNull();
		});

		it("should NOT record Glob tool", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Glob",
					toolInput: { pattern: "**/*.ts" },
					toolOutput: ["file1.ts", "file2.ts"],
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.recorded).toBe(false);
		});

		it("should NOT record when content matches exclude patterns", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Edit",
					toolInput: { file_path: ".env" },
					toolOutput: "Edited .env file content with secrets",
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{
					client,
					config: {
						privacy: {
							exclude_patterns: ["*.env", "*secret*"],
						},
					},
				},
			);

			expect(result.recorded).toBe(false);
		});

		it("should NOT record for non-existent session", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Edit",
					toolInput: {},
					toolOutput: "content",
					sessionId: "sess-nonexistent",
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.recorded).toBe(false);
		});

		it("should NOT record for ended session", async () => {
			client.endSession(sessionId, "Session ended");

			const result = await postToolUseHook(
				{
					toolName: "Edit",
					toolInput: {},
					toolOutput: "content",
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.recorded).toBe(false);
		});

		it("should return high importance for test results", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Bash",
					toolInput: { command: "bun test" },
					toolOutput: "Tests: 10 passed, 0 failed",
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.importance).toBe(0.9);
		});

		it("should verify observation is stored in DB", async () => {
			const result = await postToolUseHook(
				{
					toolName: "Write",
					toolInput: { file_path: "new.ts" },
					toolOutput: "File created",
					sessionId,
					projectPath: testDir,
					success: true,
				},
				{ client },
			);

			expect(result.observationId).toBeDefined();

			// Verify in DB
			if (result.observationId) {
				const obs = client.getObservation(result.observationId);
				expect(obs).toBeDefined();
				expect(obs?.tool_name).toBe("Write");
				expect(obs?.type).toBe("tool_use");
			}
		});
	});
});
