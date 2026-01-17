import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { createSearchEngine } from "../../src/core/search";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import {
	type MemInjectArgs,
	type MemInjectContext,
	createMemInjectSkill,
	executeMemInject,
	formatInjectSuccess,
	injectMemory,
	parseMemInjectArgs,
} from "../../src/skills/mem-inject";

describe("Mem Inject Skill", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-inject-test-${Date.now()}`);
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

	describe("parseMemInjectArgs", () => {
		it("should parse simple content", () => {
			const args = parseMemInjectArgs('"This is a test"');

			expect(args.content).toBe("This is a test");
			expect(args.importance).toBeUndefined();
		});

		it("should parse content with --importance option", () => {
			const args = parseMemInjectArgs('"Important note" --importance 0.9');

			expect(args.content).toBe("Important note");
			expect(args.importance).toBe(0.9);
		});

		it("should parse content with --type option", () => {
			const args = parseMemInjectArgs('"Context info" --type context');

			expect(args.content).toBe("Context info");
			expect(args.type).toBe("context");
		});

		it("should handle single quotes", () => {
			const args = parseMemInjectArgs("'Single quoted content'");

			expect(args.content).toBe("Single quoted content");
		});

		it("should handle multiple options", () => {
			const args = parseMemInjectArgs(
				'"Full test" --importance 0.8 --type note',
			);

			expect(args.content).toBe("Full test");
			expect(args.importance).toBe(0.8);
			expect(args.type).toBe("note");
		});

		it("should ignore invalid importance values", () => {
			const args = parseMemInjectArgs('"Test" --importance 1.5');

			expect(args.content).toBe("Test");
			expect(args.importance).toBeUndefined();
		});

		it("should handle empty string", () => {
			const args = parseMemInjectArgs("");

			expect(args.content).toBe("");
		});
	});

	describe("formatInjectSuccess", () => {
		it("should format success message", () => {
			const message = formatInjectSuccess("obs-123", "Test content", 0.7);

			expect(message).toContain("✅ 메모리에 추가됨");
			expect(message).toContain("ID: obs-123");
			expect(message).toContain("내용: Test content");
			expect(message).toContain("중요도: 0.7");
		});

		it("should truncate long content", () => {
			const longContent = "a".repeat(150);
			const message = formatInjectSuccess("obs-123", longContent, 0.5);

			expect(message).toContain("...");
			expect(message.length).toBeLessThan(200 + 100); // Header + truncated content
		});
	});

	describe("injectMemory", () => {
		it("should inject content into database", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "This project uses Express",
			};

			const result = injectMemory(context, args);

			expect(result.success).toBe(true);
			expect(result.observationId).toBeDefined();
			expect(result.message).toContain("메모리에 추가됨");
		});

		it("should use default importance", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "Test content",
			};

			const result = injectMemory(context, args);

			expect(result.success).toBe(true);

			// Check in database
			// biome-ignore lint/style/noNonNullAssertion: we just inserted this row
			const obs = client.getObservation(result.observationId!);
			expect(obs?.importance).toBe(0.7);
		});

		it("should use custom importance", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "Critical info",
				importance: 0.95,
			};

			const result = injectMemory(context, args);

			expect(result.success).toBe(true);

			// biome-ignore lint/style/noNonNullAssertion: we just inserted this row
			const obs = client.getObservation(result.observationId!);
			expect(obs?.importance).toBe(0.95);
		});

		it("should create note type observation", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "Test note",
			};

			const result = injectMemory(context, args);

			expect(result.success).toBe(true);

			// biome-ignore lint/style/noNonNullAssertion: we just inserted this row
			const obs = client.getObservation(result.observationId!);
			expect(obs?.type).toBe("note");
		});

		it("should fail for empty content", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "",
			};

			const result = injectMemory(context, args);

			expect(result.success).toBe(false);
			expect(result.error).toContain("내용이 필요합니다");
		});

		it("should fail for whitespace-only content", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "   ",
			};

			const result = injectMemory(context, args);

			expect(result.success).toBe(false);
		});

		it("should link to current session", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "Session linked note",
			};

			const result = injectMemory(context, args);

			expect(result.success).toBe(true);

			// biome-ignore lint/style/noNonNullAssertion: we just inserted this row
			const obs = client.getObservation(result.observationId!);
			expect(obs?.session_id).toBe(sessionId);
		});
	});

	describe("createMemInjectSkill", () => {
		it("should create skill instance", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};

			const skill = createMemInjectSkill(context);

			expect(skill.name).toBe("/mem-inject");
			expect(skill.execute).toBeDefined();
			expect(skill.parseArgs).toBeDefined();
		});

		it("should execute injection", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};

			const skill = createMemInjectSkill(context);
			const result = skill.execute({ content: "Skill test" });

			expect(result.success).toBe(true);
			expect(result.observationId).toBeDefined();
		});

		it("should parse args", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};

			const skill = createMemInjectSkill(context);
			const args = skill.parseArgs('"Test content" --importance 0.8');

			expect(args.content).toBe("Test content");
			expect(args.importance).toBe(0.8);
		});
	});

	describe("executeMemInject", () => {
		it("should execute and return formatted message", async () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};

			const output = await executeMemInject('"Test injection"', context);

			expect(output).toContain("✅ 메모리에 추가됨");
			expect(output).toContain("Test injection");
		});

		it("should handle errors gracefully", async () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};

			const output = await executeMemInject("", context);

			expect(output).toContain("❌");
			expect(output).toContain("내용이 필요합니다");
		});

		it("should apply importance option", async () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};

			const output = await executeMemInject(
				'"High priority" --importance 0.9',
				context,
			);

			expect(output).toContain("중요도: 0.9");
		});
	});

	describe("FTS indexing", () => {
		it("should be searchable via FTS", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "Prisma database migration tool",
			};

			const result = injectMemory(context, args);
			expect(result.success).toBe(true);

			// Search for the content using search engine
			const searchEngine = createSearchEngine(client);
			const searchResults = searchEngine.search("Prisma migration", {
				layer: 3,
			});
			expect(searchResults.length).toBeGreaterThan(0);
			expect(searchResults[0].content).toContain("Prisma");
		});

		it("should find Korean content", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};
			const args: MemInjectArgs = {
				content: "인증은 JWT 토큰 사용",
			};

			const result = injectMemory(context, args);
			expect(result.success).toBe(true);

			// Search for Korean content using search engine
			const searchEngine = createSearchEngine(client);
			const searchResults = searchEngine.search("JWT", { layer: 3 });
			expect(searchResults.length).toBeGreaterThan(0);
		});
	});

	describe("Multiple injections", () => {
		it("should handle multiple injections", () => {
			const context: MemInjectContext = {
				sessionId,
				client,
			};

			const result1 = injectMemory(context, { content: "First note" });
			const result2 = injectMemory(context, { content: "Second note" });
			const result3 = injectMemory(context, { content: "Third note" });

			expect(result1.success).toBe(true);
			expect(result2.success).toBe(true);
			expect(result3.success).toBe(true);

			// All should have different IDs
			expect(result1.observationId).not.toBe(result2.observationId);
			expect(result2.observationId).not.toBe(result3.observationId);

			// All should be in the session
			const observations = client.listObservations(sessionId);
			expect(observations.length).toBe(3);
		});
	});
});
