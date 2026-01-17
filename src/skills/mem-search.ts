/**
 * /mem-search Skill
 *
 * Search memory with progressive disclosure:
 * - Layer 1: Index only (ID + score)
 * - Layer 2: Timeline context
 * - Layer 3: Full details
 *
 * See: docs/design/core-layer.md
 */

import { type DBClient, createDBClient } from "../core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../core/db/paths";
import {
	type ObservationType,
	type SearchEngine,
	type SearchOptions,
	type SearchResult,
	createSearchEngine,
} from "../core/search";

export interface MemSearchInput {
	query: string;
	projectPath: string;
	layer?: 1 | 2 | 3;
	limit?: number;
	since?: string; // "7d", "30d", "2024-01-01"
	type?: string; // "error", "success", "bash", "tool_use", "note"
	id?: string; // Direct ID lookup
}

export interface MemSearchOutput {
	results: SearchResult[];
	totalCount: number;
	layer: number;
	formatted: string;
}

/**
 * Parse since parameter to Date
 * Supports: "7d", "30d", "2024-01-01"
 */
export function parseSince(since: string): Date | null {
	// Try relative format (e.g., "7d", "30d")
	const relativeMatch = since.match(/^(\d+)d$/);
	if (relativeMatch) {
		const days = Number.parseInt(relativeMatch[1], 10);
		const date = new Date();
		date.setDate(date.getDate() - days);
		return date;
	}

	// Try absolute date format
	const date = new Date(since);
	if (!Number.isNaN(date.getTime())) {
		return date;
	}

	return null;
}

/**
 * Parse type parameter to ObservationType array
 */
export function parseType(type: string): ObservationType[] {
	const validTypes: ObservationType[] = [
		"note",
		"tool_use",
		"bash",
		"error",
		"success",
	];
	const types = type.split(",").map((t) => t.trim().toLowerCase());
	return types.filter((t) =>
		validTypes.includes(t as ObservationType),
	) as ObservationType[];
}

/**
 * Format results as table for Layer 1
 */
export function formatTable(results: SearchResult[]): string {
	if (results.length === 0) {
		return "검색 결과가 없습니다.";
	}

	const lines: string[] = [];

	// Header
	lines.push(
		"┌────────────────┬───────┬─────────────────────────────────────┐",
	);
	lines.push(
		"│ ID             │ 점수  │ 요약                                │",
	);
	lines.push(
		"├────────────────┼───────┼─────────────────────────────────────┤",
	);

	// Rows
	for (const result of results) {
		const id = result.id.slice(0, 14).padEnd(14);
		const score = result.score.toFixed(2).padStart(5);
		const summary = (result.summary || "(없음)").slice(0, 35).padEnd(35);
		lines.push(`│ ${id} │ ${score} │ ${summary} │`);
	}

	lines.push(
		"└────────────────┴───────┴─────────────────────────────────────┘",
	);

	return lines.join("\n");
}

/**
 * Format results for Layer 2 (timeline context)
 */
export function formatTimeline(results: SearchResult[]): string {
	if (results.length === 0) {
		return "검색 결과가 없습니다.";
	}

	const lines: string[] = [];

	for (const result of results) {
		const date = result.createdAt
			? result.createdAt.toLocaleDateString("ko-KR", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
				})
			: "날짜 없음";
		const type = result.type || "unknown";
		const tool = result.toolName ? ` (${result.toolName})` : "";

		lines.push(`📌 ${result.id}`);
		lines.push(`   날짜: ${date}`);
		lines.push(`   유형: ${type}${tool}`);
		lines.push(`   점수: ${result.score.toFixed(2)}`);
		lines.push(`   요약: ${result.summary || "(없음)"}`);
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Format single result for Layer 3 (full details)
 */
export function formatDetail(result: SearchResult): string {
	const lines: string[] = [];

	lines.push(`📄 ${result.id} 상세`);
	lines.push("");

	if (result.createdAt) {
		const date = result.createdAt.toLocaleDateString("ko-KR", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
		lines.push(`세션: ${date}`);
	}

	if (result.sessionId) {
		lines.push(`세션 ID: ${result.sessionId}`);
	}

	lines.push(`유형: ${result.type || "unknown"}`);

	if (result.toolName) {
		lines.push(`도구: ${result.toolName}`);
	}

	lines.push(`점수: ${result.score.toFixed(4)}`);

	if (result.metadata) {
		lines.push(`중요도: ${result.metadata.importance || 0.5}`);
		if (result.metadata.projectPath) {
			lines.push(`프로젝트: ${result.metadata.projectPath}`);
		}
	}

	lines.push("");
	lines.push("내용:");
	lines.push("─".repeat(60));
	lines.push(result.content || result.summary || "(내용 없음)");
	lines.push("─".repeat(60));

	return lines.join("\n");
}

/**
 * Format results for Layer 3 (multiple)
 */
export function formatDetails(results: SearchResult[]): string {
	if (results.length === 0) {
		return "검색 결과가 없습니다.";
	}

	return results.map(formatDetail).join("\n\n");
}

/**
 * /mem-search skill implementation
 */
export async function memSearchSkill(
	input: MemSearchInput,
	options?: {
		client?: DBClient;
		engine?: SearchEngine;
	},
): Promise<MemSearchOutput> {
	const { query, projectPath, layer = 1, limit = 10, since, type, id } = input;

	// Initialize DB and search engine
	ensureProjectDirs(projectPath);
	const dbPath = getProjectDBPath(projectPath);

	const client = options?.client ?? createDBClient(dbPath);
	const engine = options?.engine ?? createSearchEngine(client);

	// If ID is provided, do direct lookup
	if (id) {
		const observation = client.getObservation(id);

		if (!options?.client) {
			client.close();
		}

		if (!observation) {
			return {
				results: [],
				totalCount: 0,
				layer: 3,
				formatted: `ID '${id}'를 찾을 수 없습니다.`,
			};
		}

		// Convert to SearchResult format
		const result: SearchResult = {
			id: observation.id,
			score: 1.0,
			summary: observation.content.slice(0, 100),
			createdAt: new Date(observation.created_at),
			sessionId: observation.session_id,
			type: observation.type,
			toolName: observation.tool_name ?? undefined,
			content: observation.content,
			metadata: {
				importance: observation.importance,
			},
		};

		return {
			results: [result],
			totalCount: 1,
			layer: 3,
			formatted: formatDetail(result),
		};
	}

	// Build search options
	const searchOptions: SearchOptions = {
		limit,
		layer,
		projectPath,
	};

	if (since) {
		const sinceDate = parseSince(since);
		if (sinceDate) {
			searchOptions.since = sinceDate;
		}
	}

	if (type) {
		const types = parseType(type);
		if (types.length > 0) {
			searchOptions.types = types;
		}
	}

	// Search
	let results: SearchResult[] = [];
	try {
		results = engine.search(query, searchOptions);
	} catch {
		if (!options?.client) {
			client.close();
		}
		return {
			results: [],
			totalCount: 0,
			layer,
			formatted: "검색 중 오류가 발생했습니다.",
		};
	}

	// Close if we created the client
	if (!options?.client) {
		client.close();
	}

	// Format output based on layer
	let formatted: string;
	if (layer === 1) {
		formatted = `🔍 검색 결과: "${query}" (${results.length}건)\n\n${formatTable(results)}`;
	} else if (layer === 2) {
		formatted = `🔍 검색 결과: "${query}" (${results.length}건)\n\n${formatTimeline(results)}`;
	} else {
		formatted = `🔍 검색 결과: "${query}" (${results.length}건)\n\n${formatDetails(results)}`;
	}

	return {
		results,
		totalCount: results.length,
		layer,
		formatted,
	};
}

/**
 * Parse command line arguments for /mem-search
 *
 * Examples:
 * - /mem-search "JWT authentication"
 * - /mem-search --layer 3 obs-a1b2
 * - /mem-search "database" --since 7d --type error
 */
export function parseArgs(
	argsString: string,
	projectPath: string,
): MemSearchInput {
	const args: MemSearchInput = {
		query: "",
		projectPath,
	};

	// Split by spaces but keep quoted strings together
	const tokens: string[] = [];
	let current = "";
	let inQuotes = false;

	for (const char of argsString) {
		if (char === '"' || char === "'") {
			inQuotes = !inQuotes;
		} else if (char === " " && !inQuotes) {
			if (current) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}
	if (current) {
		tokens.push(current);
	}

	// Parse tokens
	let i = 0;
	while (i < tokens.length) {
		const token = tokens[i];

		if (token === "--layer" && i + 1 < tokens.length) {
			const layerNum = Number.parseInt(tokens[i + 1], 10);
			if (layerNum >= 1 && layerNum <= 3) {
				args.layer = layerNum as 1 | 2 | 3;
			}
			i += 2;
		} else if (token === "--limit" && i + 1 < tokens.length) {
			args.limit = Number.parseInt(tokens[i + 1], 10);
			i += 2;
		} else if (token === "--since" && i + 1 < tokens.length) {
			args.since = tokens[i + 1];
			i += 2;
		} else if (token === "--type" && i + 1 < tokens.length) {
			args.type = tokens[i + 1];
			i += 2;
		} else if (token.startsWith("obs-")) {
			// Direct ID lookup
			args.id = token;
			args.layer = 3; // Default to layer 3 for ID lookup
			i++;
		} else if (!token.startsWith("--")) {
			// Query term
			args.query = args.query ? `${args.query} ${token}` : token;
			i++;
		} else {
			i++;
		}
	}

	return args;
}

/**
 * Execute /mem-search skill from command string
 */
export async function executeMemSearch(
	argsString: string,
	projectPath: string,
	options?: {
		client?: DBClient;
		engine?: SearchEngine;
	},
): Promise<string> {
	const input = parseArgs(argsString, projectPath);

	if (!input.query && !input.id) {
		return `사용법: /mem-search <query> [options]

옵션:
  --layer <1|2|3>  상세 수준 (기본: 1)
  --since <7d|30d|YYYY-MM-DD>  기간 필터
  --type <error|success|bash|tool_use|note>  유형 필터
  --limit <n>  결과 수 제한

예시:
  /mem-search "JWT authentication"
  /mem-search --layer 3 obs-a1b2c3d4
  /mem-search "database" --since 7d --type error`;
	}

	const result = await memSearchSkill(input, options);
	return result.formatted;
}
