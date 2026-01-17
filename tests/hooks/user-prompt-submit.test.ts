import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { createSearchEngine } from "../../src/core/search";
import {
	extractKeywords,
	formatContext,
	formatNotification,
	userPromptSubmitHook,
} from "../../src/hooks/user-prompt-submit";

describe("UserPromptSubmit Hook", () => {
	let testDir: string;
	let client: DBClient;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		ensureProjectDirs(testDir);
		client = createDBClient(getProjectDBPath(testDir));

		// Create a session with observations for testing
		const session = client.createSession({ project_path: testDir });
		sessionId = session.id;

		// Add some test observations
		client.createObservation({
			session_id: sessionId,
			type: "note",
			content: "TypeScript configuration with strict mode enabled",
		});

		client.createObservation({
			session_id: sessionId,
			type: "tool_use",
			tool_name: "Edit",
			content: "Edited authentication module for JWT tokens",
		});

		client.createObservation({
			session_id: sessionId,
			type: "bash",
			content: "npm test passed with 100 tests",
		});
	});

	afterEach(() => {
		client.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("extractKeywords", () => {
		it("should extract keywords from prompt", () => {
			const keywords = extractKeywords("How do I configure TypeScript?");

			expect(keywords).toContain("configure");
			expect(keywords).toContain("typescript");
		});

		it("should remove stopwords", () => {
			const keywords = extractKeywords("How do I configure the TypeScript?");

			expect(keywords).not.toContain("how");
			expect(keywords).not.toContain("do");
			expect(keywords).not.toContain("the");
		});

		it("should handle Korean prompts", () => {
			const keywords = extractKeywords("TypeScript 설정을 어떻게 하나요?");

			expect(keywords).toContain("typescript");
			// Korean words with particles are kept as-is (no morphological analysis)
			expect(keywords).toContain("설정을");
			expect(keywords).toContain("어떻게");
			expect(keywords).toContain("하나요");
		});

		it("should limit to 5 keywords", () => {
			const keywords = extractKeywords(
				"one two three four five six seven eight nine ten",
			);

			expect(keywords.length).toBeLessThanOrEqual(5);
		});

		it("should return empty for stopwords-only prompt", () => {
			const keywords = extractKeywords("the is a an");

			expect(keywords).toEqual([]);
		});

		it("should deduplicate keywords", () => {
			const keywords = extractKeywords("typescript TypeScript TYPESCRIPT");

			expect(keywords.length).toBe(1);
			expect(keywords).toContain("typescript");
		});
	});

	describe("formatNotification", () => {
		it("should return empty string for no results", () => {
			const notification = formatNotification([]);

			expect(notification).toBe("");
		});

		it("should format results as notification", () => {
			const results = [
				{
					id: "obs-1",
					score: 0.92,
					summary: "JWT 인증 구현",
					createdAt: new Date("2025-01-15"),
				},
				{
					id: "obs-2",
					score: 0.85,
					summary: "에러 처리 패턴",
					createdAt: new Date("2025-01-14"),
				},
			];

			const notification = formatNotification(results);

			expect(notification).toContain("🔍 관련 메모리 발견:");
			expect(notification).toContain("JWT 인증 구현");
			expect(notification).toContain("0.92");
			expect(notification).toContain("/mem-search --layer 3 <id>");
		});

		it("should show count for more than 3 results", () => {
			const results = Array(5)
				.fill(null)
				.map((_, i) => ({
					id: `obs-${i}`,
					score: 0.9 - i * 0.1,
					summary: `Result ${i}`,
					createdAt: new Date(),
				}));

			const notification = formatNotification(results);

			expect(notification).toContain("외 2건...");
		});

		it("should truncate long summaries", () => {
			const results = [
				{
					id: "obs-1",
					score: 0.9,
					summary: "A".repeat(60),
					createdAt: new Date(),
				},
			];

			const notification = formatNotification(results);

			expect(notification).toContain("...");
		});
	});

	describe("formatContext", () => {
		it("should return empty for no results", () => {
			const result = formatContext([], 1000);

			expect(result.context).toBe("");
			expect(result.tokenCount).toBe(0);
		});

		it("should format results as context", () => {
			const results = [
				{
					id: "obs-1",
					score: 0.9,
					content: "JWT token implementation details",
					createdAt: new Date("2025-01-15"),
				},
			];

			const result = formatContext(results, 1000);

			expect(result.context).toContain("📝 관련 기억:");
			expect(result.context).toContain("JWT token implementation details");
			expect(result.tokenCount).toBeGreaterThan(0);
		});

		it("should respect token limit", () => {
			const results = Array(10)
				.fill(null)
				.map((_, i) => ({
					id: `obs-${i}`,
					score: 0.9,
					content: "A".repeat(100),
					createdAt: new Date(),
				}));

			const result = formatContext(results, 50);

			// Should be limited
			expect(result.tokenCount).toBeLessThanOrEqual(50);
		});

		it("should truncate long content", () => {
			const results = [
				{
					id: "obs-1",
					score: 0.9,
					content: "A".repeat(500),
					createdAt: new Date(),
				},
			];

			const result = formatContext(results, 1000);

			expect(result.context).toContain("...");
		});
	});

	describe("userPromptSubmitHook", () => {
		it("should find related memories for relevant prompt", async () => {
			const engine = createSearchEngine(client);

			const result = await userPromptSubmitHook(
				{
					prompt: "How do I configure TypeScript?",
					sessionId,
					projectPath: testDir,
				},
				{ client, engine },
			);

			expect(result.relatedMemories.length).toBeGreaterThan(0);
			expect(result.notification).toContain("🔍 관련 메모리 발견:");
		});

		it("should return empty for no matching memories", async () => {
			const engine = createSearchEngine(client);

			const result = await userPromptSubmitHook(
				{
					prompt: "What about Python Django framework?",
					sessionId,
					projectPath: testDir,
				},
				{ client, engine },
			);

			expect(result.relatedMemories).toEqual([]);
			expect(result.notification).toBe("");
		});

		it("should return empty for stopwords-only prompt", async () => {
			const result = await userPromptSubmitHook(
				{
					prompt: "the is a an",
					sessionId,
					projectPath: testDir,
				},
				{ client },
			);

			expect(result.relatedMemories).toEqual([]);
			expect(result.notification).toBe("");
			expect(result.tokenCount).toBe(0);
		});

		it("should inject context when auto_inject is enabled", async () => {
			const engine = createSearchEngine(client);

			const result = await userPromptSubmitHook(
				{
					prompt: "TypeScript configuration",
					sessionId,
					projectPath: testDir,
				},
				{
					client,
					engine,
					config: {
						memory: {
							auto_inject: true,
							max_inject_tokens: 2000,
							retention_days: 30,
						},
					},
				},
			);

			if (result.relatedMemories.length > 0) {
				expect(result.injectedContext).toContain("📝 관련 기억:");
				expect(result.tokenCount).toBeGreaterThan(0);
			}
		});

		it("should NOT inject context when auto_inject is disabled", async () => {
			const engine = createSearchEngine(client);

			const result = await userPromptSubmitHook(
				{
					prompt: "TypeScript configuration",
					sessionId,
					projectPath: testDir,
				},
				{
					client,
					engine,
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

		it("should handle search errors gracefully", async () => {
			// Close the client to simulate error
			const badClient = createDBClient(":memory:");
			badClient.close();

			const result = await userPromptSubmitHook(
				{
					prompt: "TypeScript configuration",
					sessionId,
					projectPath: testDir,
				},
				{ client: badClient },
			);

			// Should not throw, return empty result
			expect(result.notification).toBe("");
			expect(result.relatedMemories).toEqual([]);
		});

		it("should search with extracted keywords", async () => {
			const engine = createSearchEngine(client);

			// Add observation with specific keyword
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Authentication using JWT tokens for API security",
			});

			const result = await userPromptSubmitHook(
				{
					prompt: "authentication JWT",
					sessionId,
					projectPath: testDir,
				},
				{ client, engine },
			);

			expect(result.relatedMemories.length).toBeGreaterThan(0);
		});
	});
});
