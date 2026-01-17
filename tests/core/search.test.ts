import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DBClient, createDBClient } from "../../src/core/db/client";
import { type SearchEngine, createSearchEngine } from "../../src/core/search";

describe("SearchEngine", () => {
	let client: DBClient;
	let engine: SearchEngine;
	let sessionId: string;

	beforeEach(() => {
		client = createDBClient(":memory:");
		engine = createSearchEngine(client);

		// Create a session and some observations for testing
		const session = client.createSession({ project_path: "/test/project" });
		sessionId = session.id;

		// Add test observations
		client.createObservation({
			session_id: sessionId,
			type: "note",
			content: "This is a test note about TypeScript programming",
		});

		client.createObservation({
			session_id: sessionId,
			type: "tool_use",
			tool_name: "Read",
			content: "Reading file src/index.ts with important configuration",
		});

		client.createObservation({
			session_id: sessionId,
			type: "error",
			content: "Error: Cannot find module typescript in the project",
		});

		client.createObservation({
			session_id: sessionId,
			type: "success",
			content: "Successfully compiled the TypeScript code without errors",
		});

		client.createObservation({
			session_id: sessionId,
			type: "bash",
			content: "npm install typescript --save-dev",
		});
	});

	afterEach(() => {
		engine.close();
	});

	describe("Basic search", () => {
		it("should find observations by keyword", () => {
			const results = engine.search("typescript");

			expect(results.length).toBeGreaterThan(0);
			for (const r of results) {
				expect(r.id).toMatch(/^obs-/);
				expect(r.score).toBeGreaterThan(0);
			}
		});

		it("should return empty array for no matches", () => {
			const results = engine.search("nonexistentterm12345");

			expect(results).toEqual([]);
		});

		it("should return empty array for empty query", () => {
			const results = engine.search("");

			expect(results).toEqual([]);
		});

		it("should return empty array for whitespace query", () => {
			const results = engine.search("   ");

			expect(results).toEqual([]);
		});

		it("should find observations with multiple keywords", () => {
			const results = engine.search("typescript error");

			expect(results.length).toBeGreaterThan(0);
		});

		it("should handle special characters in query", () => {
			// Should not throw
			const results = engine.search('test "quoted" (parens)');
			expect(Array.isArray(results)).toBe(true);
		});
	});

	describe("Search options", () => {
		it("should respect limit option", () => {
			const results = engine.search("typescript", { limit: 2 });

			expect(results.length).toBeLessThanOrEqual(2);
		});

		it("should filter by types", () => {
			const results = engine.search("typescript", { types: ["error"] });

			expect(results.length).toBe(1);
			expect(results[0].summary).toContain("Error");
		});

		it("should filter by multiple types", () => {
			const results = engine.search("typescript", {
				types: ["note", "success"],
			});

			expect(results.length).toBe(2);
		});

		it("should filter by since date", () => {
			const futureDate = new Date(Date.now() + 10000);
			const results = engine.search("typescript", { since: futureDate });

			expect(results).toEqual([]);
		});

		it("should filter by projectPath", () => {
			// Create another session with different project
			const session2 = client.createSession({
				project_path: "/other/project",
			});
			client.createObservation({
				session_id: session2.id,
				type: "note",
				content: "TypeScript in other project",
			});

			// All results should be from the test project (layer 3 to get metadata)
			const fullResult = engine.search("typescript", {
				projectPath: "/test/project",
				layer: 3,
			});

			expect(fullResult.length).toBeGreaterThan(0);
			for (const fr of fullResult) {
				expect(fr.metadata?.projectPath).toBe("/test/project");
			}
		});
	});

	describe("Progressive Disclosure", () => {
		it("should return Layer 1 by default (summary only)", () => {
			const results = engine.search("typescript", { layer: 1 });

			expect(results.length).toBeGreaterThan(0);
			const result = results[0];

			expect(result.id).toBeDefined();
			expect(result.score).toBeDefined();
			expect(result.summary).toBeDefined();
			expect(result.createdAt).toBeUndefined();
			expect(result.sessionId).toBeUndefined();
			expect(result.content).toBeUndefined();
			expect(result.metadata).toBeUndefined();
		});

		it("should return Layer 2 with more context", () => {
			const results = engine.search("typescript", { layer: 2 });

			expect(results.length).toBeGreaterThan(0);
			const result = results[0];

			expect(result.id).toBeDefined();
			expect(result.score).toBeDefined();
			expect(result.summary).toBeDefined();
			expect(result.createdAt).toBeInstanceOf(Date);
			expect(result.sessionId).toBe(sessionId);
			expect(result.type).toBeDefined();
			expect(result.content).toBeUndefined();
			expect(result.metadata).toBeUndefined();
		});

		it("should return Layer 3 with full details", () => {
			const results = engine.search("typescript", { layer: 3 });

			expect(results.length).toBeGreaterThan(0);
			const result = results[0];

			expect(result.id).toBeDefined();
			expect(result.score).toBeDefined();
			expect(result.summary).toBeDefined();
			expect(result.createdAt).toBeInstanceOf(Date);
			expect(result.sessionId).toBe(sessionId);
			expect(result.type).toBeDefined();
			expect(result.content).toBeDefined();
			expect(result.metadata).toBeDefined();
			expect(result.metadata?.importance).toBeDefined();
			expect(result.metadata?.projectPath).toBe("/test/project");
		});
	});

	describe("Scoring", () => {
		it("should return results with positive scores", () => {
			const results = engine.search("typescript", { layer: 1 });

			expect(results.length).toBeGreaterThan(0);
			for (const r of results) {
				expect(r.score).toBeGreaterThan(0);
			}
		});
	});

	describe("Summary truncation", () => {
		it("should truncate long content in summary", () => {
			// Create observation with long content
			const longContent = "TypeScript ".repeat(50);
			client.createObservation({
				session_id: sessionId,
				type: "note",
				content: longContent,
			});

			const results = engine.search("TypeScript", { layer: 1 });
			const longResult = results.find((r) => r.summary?.endsWith("..."));

			expect(longResult).toBeDefined();
			expect(longResult?.summary?.length).toBeLessThanOrEqual(103); // 100 + "..."
		});
	});
});
