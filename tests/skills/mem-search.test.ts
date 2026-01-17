import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../../src/core/db/paths";
import { createSearchEngine } from "../../src/core/search";
import {
	executeMemSearch,
	formatDetail,
	formatTable,
	formatTimeline,
	memSearchSkill,
	parseArgs,
	parseSince,
	parseType,
} from "../../src/skills/mem-search";

describe("MemSearch Skill", () => {
	let testDir: string;
	let client: DBClient;
	let sessionId: string;
	let obsId: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-mem-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		ensureProjectDirs(testDir);
		client = createDBClient(getProjectDBPath(testDir));

		// Create session and observations
		const session = client.createSession({ project_path: testDir });
		sessionId = session.id;

		const obs = client.createObservation({
			session_id: sessionId,
			type: "note",
			content: "TypeScript configuration with strict mode enabled",
		});
		obsId = obs.id;

		client.createObservation({
			session_id: sessionId,
			type: "error",
			content: "Error: Cannot find module typescript",
		});

		client.createObservation({
			session_id: sessionId,
			type: "bash",
			content: "npm test passed with all tests",
		});
	});

	afterEach(() => {
		client.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("parseSince", () => {
		it("should parse relative days format", () => {
			const date = parseSince("7d");

			expect(date).toBeInstanceOf(Date);
			const diff = date ? Date.now() - date.getTime() : 0;
			expect(diff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
			expect(diff).toBeLessThan(8 * 24 * 60 * 60 * 1000);
		});

		it("should parse absolute date format", () => {
			const date = parseSince("2025-01-01");

			expect(date).toBeInstanceOf(Date);
			expect(date?.getFullYear()).toBe(2025);
			expect(date?.getMonth()).toBe(0); // January
			expect(date?.getDate()).toBe(1);
		});

		it("should return null for invalid format", () => {
			expect(parseSince("invalid")).toBeNull();
			expect(parseSince("")).toBeNull();
		});
	});

	describe("parseType", () => {
		it("should parse single type", () => {
			expect(parseType("error")).toEqual(["error"]);
		});

		it("should parse multiple types", () => {
			expect(parseType("error,bash")).toEqual(["error", "bash"]);
		});

		it("should filter invalid types", () => {
			expect(parseType("error,invalid,bash")).toEqual(["error", "bash"]);
		});

		it("should handle case insensitive", () => {
			expect(parseType("Error,BASH")).toEqual(["error", "bash"]);
		});
	});

	describe("formatTable", () => {
		it("should format results as table", () => {
			const results = [
				{ id: "obs-abc123", score: 0.95, summary: "Test summary" },
			];

			const table = formatTable(results);

			expect(table).toContain("obs-abc123");
			expect(table).toContain("0.95");
			expect(table).toContain("Test summary");
			expect(table).toContain("┌");
			expect(table).toContain("└");
		});

		it("should return message for empty results", () => {
			expect(formatTable([])).toBe("검색 결과가 없습니다.");
		});
	});

	describe("formatTimeline", () => {
		it("should format results with timeline", () => {
			const results = [
				{
					id: "obs-abc123",
					score: 0.9,
					summary: "Test",
					createdAt: new Date("2025-01-15"),
					type: "note" as const,
					toolName: "Read",
				},
			];

			const timeline = formatTimeline(results);

			expect(timeline).toContain("📌 obs-abc123");
			expect(timeline).toContain("유형: note (Read)");
			expect(timeline).toContain("점수: 0.90");
		});

		it("should return message for empty results", () => {
			expect(formatTimeline([])).toBe("검색 결과가 없습니다.");
		});
	});

	describe("formatDetail", () => {
		it("should format single result with full details", () => {
			const result = {
				id: "obs-abc123",
				score: 0.95,
				summary: "Short summary",
				content: "Full content here",
				createdAt: new Date("2025-01-15"),
				sessionId: "sess-xyz",
				type: "tool_use" as const,
				toolName: "Edit",
				metadata: {
					importance: 0.8,
					projectPath: "/test/project",
				},
			};

			const detail = formatDetail(result);

			expect(detail).toContain("📄 obs-abc123 상세");
			expect(detail).toContain("세션 ID: sess-xyz");
			expect(detail).toContain("유형: tool_use");
			expect(detail).toContain("도구: Edit");
			expect(detail).toContain("중요도: 0.8");
			expect(detail).toContain("Full content here");
		});
	});

	describe("parseArgs", () => {
		it("should parse simple query", () => {
			const args = parseArgs("typescript", testDir);

			expect(args.query).toBe("typescript");
			expect(args.projectPath).toBe(testDir);
		});

		it("should parse quoted query", () => {
			const args = parseArgs('"JWT authentication"', testDir);

			expect(args.query).toBe("JWT authentication");
		});

		it("should parse layer option", () => {
			const args = parseArgs("test --layer 3", testDir);

			expect(args.query).toBe("test");
			expect(args.layer).toBe(3);
		});

		it("should parse since option", () => {
			const args = parseArgs("test --since 7d", testDir);

			expect(args.since).toBe("7d");
		});

		it("should parse type option", () => {
			const args = parseArgs("test --type error", testDir);

			expect(args.type).toBe("error");
		});

		it("should parse limit option", () => {
			const args = parseArgs("test --limit 5", testDir);

			expect(args.limit).toBe(5);
		});

		it("should parse ID for direct lookup", () => {
			const args = parseArgs("obs-abc123", testDir);

			expect(args.id).toBe("obs-abc123");
			expect(args.layer).toBe(3);
		});

		it("should parse multiple options", () => {
			const args = parseArgs(
				"database --since 7d --type error --limit 5",
				testDir,
			);

			expect(args.query).toBe("database");
			expect(args.since).toBe("7d");
			expect(args.type).toBe("error");
			expect(args.limit).toBe(5);
		});
	});

	describe("memSearchSkill", () => {
		it("should search and return results", async () => {
			const engine = createSearchEngine(client);

			const result = await memSearchSkill(
				{
					query: "typescript",
					projectPath: testDir,
				},
				{ client, engine },
			);

			expect(result.results.length).toBeGreaterThan(0);
			expect(result.layer).toBe(1);
			expect(result.formatted).toContain("🔍 검색 결과");
		});

		it("should return layer 1 table format by default", async () => {
			const engine = createSearchEngine(client);

			const result = await memSearchSkill(
				{
					query: "typescript",
					projectPath: testDir,
					layer: 1,
				},
				{ client, engine },
			);

			expect(result.formatted).toContain("┌");
			expect(result.formatted).toContain("ID");
			expect(result.formatted).toContain("점수");
		});

		it("should return layer 2 timeline format", async () => {
			const engine = createSearchEngine(client);

			const result = await memSearchSkill(
				{
					query: "typescript",
					projectPath: testDir,
					layer: 2,
				},
				{ client, engine },
			);

			expect(result.formatted).toContain("📌");
			expect(result.formatted).toContain("유형:");
		});

		it("should return layer 3 detail format", async () => {
			const engine = createSearchEngine(client);

			const result = await memSearchSkill(
				{
					query: "typescript",
					projectPath: testDir,
					layer: 3,
				},
				{ client, engine },
			);

			expect(result.formatted).toContain("📄");
			expect(result.formatted).toContain("상세");
		});

		it("should filter by type", async () => {
			const engine = createSearchEngine(client);

			const result = await memSearchSkill(
				{
					query: "typescript",
					projectPath: testDir,
					type: "error",
				},
				{ client, engine },
			);

			// Should only return error type
			for (const r of result.results) {
				if (r.type) {
					expect(r.type).toBe("error");
				}
			}
		});

		it("should do direct ID lookup", async () => {
			const result = await memSearchSkill(
				{
					query: "",
					projectPath: testDir,
					id: obsId,
				},
				{ client },
			);

			expect(result.results.length).toBe(1);
			expect(result.results[0].id).toBe(obsId);
			expect(result.layer).toBe(3);
		});

		it("should return not found for invalid ID", async () => {
			const result = await memSearchSkill(
				{
					query: "",
					projectPath: testDir,
					id: "obs-nonexistent",
				},
				{ client },
			);

			expect(result.results.length).toBe(0);
			expect(result.formatted).toContain("찾을 수 없습니다");
		});

		it("should return empty for no matches", async () => {
			const engine = createSearchEngine(client);

			const result = await memSearchSkill(
				{
					query: "pythondjango",
					projectPath: testDir,
				},
				{ client, engine },
			);

			expect(result.results.length).toBe(0);
			expect(result.formatted).toContain("검색 결과가 없습니다");
		});

		it("should respect limit option", async () => {
			const engine = createSearchEngine(client);

			const result = await memSearchSkill(
				{
					query: "test",
					projectPath: testDir,
					limit: 1,
				},
				{ client, engine },
			);

			expect(result.results.length).toBeLessThanOrEqual(1);
		});
	});

	describe("executeMemSearch", () => {
		it("should show usage for empty query", async () => {
			const result = await executeMemSearch("", testDir, { client });

			expect(result).toContain("사용법:");
			expect(result).toContain("--layer");
			expect(result).toContain("--since");
		});

		it("should execute search with query", async () => {
			const engine = createSearchEngine(client);
			const result = await executeMemSearch("typescript", testDir, {
				client,
				engine,
			});

			expect(result).toContain("🔍 검색 결과");
		});

		it("should execute ID lookup", async () => {
			const result = await executeMemSearch(obsId, testDir, { client });

			expect(result).toContain("📄");
			expect(result).toContain(obsId);
		});
	});
});
