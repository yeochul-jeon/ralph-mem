import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { createSearchEngine } from "../../src/core/search";
import { type MemoryStore, createMemoryStore } from "../../src/core/store";
import {
	type MemForgetArgs,
	type MemForgetContext,
	createMemForgetSkill,
	executeMemForget,
	forgetMemory,
	formatPreviewMessage,
	formatSuccessMessage,
	parseMemForgetArgs,
} from "../../src/skills/mem-forget";

describe("Mem Forget Skill", () => {
	let testDir: string;
	let client: DBClient;
	let store: MemoryStore;
	let sessionId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-forget-test-${Date.now()}`);
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

	describe("parseMemForgetArgs", () => {
		it("should parse single ID", () => {
			const args = parseMemForgetArgs("obs-xyz123");

			expect(args.id).toBe("obs-xyz123");
			expect(args.confirm).toBeUndefined();
		});

		it("should parse ID with --confirm", () => {
			const args = parseMemForgetArgs("obs-xyz123 --confirm");

			expect(args.id).toBe("obs-xyz123");
			expect(args.confirm).toBe(true);
		});

		it("should parse --session option", () => {
			const args = parseMemForgetArgs("--session sess-abc");

			expect(args.sessionId).toBe("sess-abc");
		});

		it("should parse --before option", () => {
			const args = parseMemForgetArgs("--before 7d");

			expect(args.before).toBe("7d");
		});

		it("should parse multiple options", () => {
			const args = parseMemForgetArgs("--before 7d --confirm");

			expect(args.before).toBe("7d");
			expect(args.confirm).toBe(true);
		});

		it("should handle empty string", () => {
			const args = parseMemForgetArgs("");

			expect(args.id).toBeUndefined();
			expect(args.sessionId).toBeUndefined();
		});
	});

	describe("formatPreviewMessage", () => {
		it("should format preview with targets", () => {
			const targets = [
				{ id: "obs-1", content: "First observation" },
				{ id: "obs-2", content: "Second observation" },
			];

			const message = formatPreviewMessage(targets);

			expect(message).toContain("⚠️ 삭제 대상:");
			expect(message).toContain("obs-1: First observation");
			expect(message).toContain("obs-2: Second observation");
			expect(message).toContain("--confirm");
		});

		it("should truncate long content", () => {
			const targets = [{ id: "obs-1", content: "a".repeat(100) }];

			const message = formatPreviewMessage(targets);

			expect(message).toContain("...");
		});

		it("should show overflow count", () => {
			const targets = Array(10)
				.fill(0)
				.map((_, i) => ({ id: `obs-${i}`, content: `Content ${i}` }));

			const message = formatPreviewMessage(targets);

			expect(message).toContain("외 5개");
		});

		it("should handle empty targets", () => {
			const message = formatPreviewMessage([]);

			expect(message).toBe("삭제 대상 없음");
		});
	});

	describe("formatSuccessMessage", () => {
		it("should format success message", () => {
			const message = formatSuccessMessage(5);

			expect(message).toBe("✅ 삭제됨: 5개 observation");
		});
	});

	describe("forgetMemory", () => {
		it("should require target specification", () => {
			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const result = forgetMemory(context, {});

			expect(result.success).toBe(false);
			expect(result.error).toContain("삭제 대상을 지정");
		});

		it("should return preview without --confirm", () => {
			// Create observation to delete
			const obs = client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "To be deleted",
			});

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const result = forgetMemory(context, { id: obs.id });

			expect(result.success).toBe(false);
			expect(result.requiresConfirmation).toBe(true);
			expect(result.targets).toHaveLength(1);
			expect(result.message).toContain("⚠️");
		});

		it("should delete with --confirm", () => {
			// Create observation to delete
			const obs = client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "To be deleted",
			});

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const result = forgetMemory(context, { id: obs.id, confirm: true });

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);
			expect(result.message).toContain("✅");

			// Verify deletion
			const deleted = client.getObservation(obs.id);
			expect(deleted).toBeNull();
		});

		it("should handle non-existent ID", () => {
			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const result = forgetMemory(context, { id: "non-existent" });

			expect(result.success).toBe(false);
			expect(result.message).toContain("삭제 대상 없음");
		});

		it("should delete all in session", () => {
			// Create multiple observations
			for (let i = 0; i < 3; i++) {
				client.createObservation({
					session_id: sessionId,
					type: "note",
					content: `Note ${i}`,
				});
			}

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const result = forgetMemory(context, {
				sessionId,
				confirm: true,
			});

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(3);

			// Verify all deleted
			const remaining = client.listObservations(sessionId);
			expect(remaining.length).toBe(0);
		});

		it("should delete by date (--before)", () => {
			// Create old observation
			const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
			client.db
				.prepare(
					`
					INSERT INTO observations (id, session_id, type, content, created_at)
					VALUES (?, ?, ?, ?, ?)
				`,
				)
				.run(
					"old-obs",
					sessionId,
					"note",
					"Old observation",
					oldDate.toISOString(),
				);

			// Create recent observation
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Recent observation",
			});

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			// Delete observations older than 7 days
			const result = forgetMemory(context, {
				before: "7d",
				confirm: true,
			});

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);

			// Verify only old one deleted
			const remaining = client.listObservations(sessionId);
			expect(remaining.length).toBe(1);
			expect(remaining[0].content).toBe("Recent observation");
		});
	});

	describe("createMemForgetSkill", () => {
		it("should create skill instance", () => {
			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const skill = createMemForgetSkill(context);

			expect(skill.name).toBe("/mem-forget");
			expect(skill.execute).toBeDefined();
			expect(skill.parseArgs).toBeDefined();
		});

		it("should execute deletion", () => {
			const obs = client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "To delete",
			});

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const skill = createMemForgetSkill(context);
			const result = skill.execute({ id: obs.id, confirm: true });

			expect(result.success).toBe(true);
		});
	});

	describe("executeMemForget", () => {
		it("should execute and return formatted message", async () => {
			const obs = client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Test deletion",
			});

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const output = await executeMemForget(`${obs.id} --confirm`, context);

			expect(output).toContain("✅");
			expect(output).toContain("1개");
		});

		it("should show error for empty args", async () => {
			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const output = await executeMemForget("", context);

			expect(output).toContain("❌");
		});

		it("should show preview without --confirm", async () => {
			const obs = client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Test observation",
			});

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			const output = await executeMemForget(obs.id, context);

			expect(output).toContain("⚠️");
			expect(output).toContain("--confirm");
		});
	});

	describe("FTS index removal", () => {
		it("should remove from FTS index after deletion", () => {
			// Create observation
			const obs = client.createObservation({
				session_id: sessionId,
				type: "note",
				content: "Searchable content for testing",
			});

			// Verify searchable
			const searchEngine = createSearchEngine(client);
			let results = searchEngine.search("Searchable content", { layer: 3 });
			expect(results.length).toBeGreaterThan(0);

			// Delete
			const context: MemForgetContext = {
				sessionId,
				client,
			};
			const result = forgetMemory(context, { id: obs.id, confirm: true });
			expect(result.success).toBe(true);

			// Verify not searchable anymore
			results = searchEngine.search("Searchable content", { layer: 3 });
			expect(results.length).toBe(0);
		});
	});

	describe("Multiple deletions", () => {
		it("should handle deleting multiple observations", () => {
			// Create multiple
			const ids: string[] = [];
			for (let i = 0; i < 5; i++) {
				const obs = client.createObservation({
					session_id: sessionId,
					type: "note",
					content: `Note ${i}`,
				});
				ids.push(obs.id);
			}

			const context: MemForgetContext = {
				sessionId,
				client,
			};

			// Delete first one
			forgetMemory(context, { id: ids[0], confirm: true });

			// Should have 4 left
			const remaining = client.listObservations(sessionId);
			expect(remaining.length).toBe(4);
		});
	});
});
