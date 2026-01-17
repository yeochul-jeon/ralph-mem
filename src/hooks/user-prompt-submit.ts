/**
 * UserPromptSubmit Hook
 *
 * Triggered when user submits a prompt.
 * Searches memory and injects relevant context.
 *
 * See: docs/design/hook-layer.md
 */

import { type DBClient, createDBClient } from "../core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../core/db/paths";
import {
	type SearchEngine,
	type SearchOptions,
	type SearchResult,
	createSearchEngine,
} from "../core/search";
import { estimateTokens } from "../core/store";
import { type Config, loadConfig } from "../utils/config";

export interface UserPromptSubmitContext {
	prompt: string;
	sessionId: string;
	projectPath: string;
}

export interface UserPromptSubmitResult {
	notification: string;
	injectedContext: string;
	tokenCount: number;
	relatedMemories: SearchResult[];
}

/**
 * Common stopwords to filter out from search queries
 */
const STOPWORDS = new Set([
	// English
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"has",
	"he",
	"in",
	"is",
	"it",
	"its",
	"of",
	"on",
	"or",
	"that",
	"the",
	"to",
	"was",
	"were",
	"will",
	"with",
	"this",
	"they",
	"but",
	"have",
	"not",
	"what",
	"when",
	"where",
	"who",
	"which",
	"why",
	"how",
	"all",
	"each",
	"she",
	"do",
	"if",
	"my",
	"their",
	"then",
	"so",
	"than",
	"too",
	"very",
	"can",
	"just",
	"should",
	"now",
	"i",
	"you",
	"we",
	"me",
	// Korean common particles
	"은",
	"는",
	"이",
	"가",
	"을",
	"를",
	"의",
	"에",
	"에서",
	"으로",
	"로",
	"와",
	"과",
	"도",
	"만",
	"까지",
	"부터",
	"처럼",
	"같이",
	// Common command words
	"please",
	"help",
	"show",
	"tell",
	"explain",
	"find",
	"get",
	"make",
	"create",
	"해줘",
	"해주세요",
	"알려줘",
	"보여줘",
]);

/**
 * Extract keywords from prompt for search
 */
export function extractKeywords(prompt: string): string[] {
	// Tokenize by whitespace and punctuation
	const tokens = prompt
		.toLowerCase()
		.split(/[\s,.;:!?()[\]{}'"]+/)
		.filter((t) => t.length >= 2);

	// Remove stopwords and duplicates
	const keywords = tokens.filter((t) => !STOPWORDS.has(t));

	// Return unique keywords (max 5 for efficient search)
	return [...new Set(keywords)].slice(0, 5);
}

/**
 * Format search results as a notification message
 */
export function formatNotification(results: SearchResult[]): string {
	if (results.length === 0) {
		return "";
	}

	const lines: string[] = ["🔍 관련 메모리 발견:"];

	for (const result of results.slice(0, 3)) {
		const date = result.createdAt
			? result.createdAt.toLocaleDateString("ko-KR", {
					month: "numeric",
					day: "numeric",
				})
			: "";
		const score = result.score.toFixed(2);
		const summary = result.summary || "(요약 없음)";

		lines.push(
			`- ${summary.slice(0, 40)}${summary.length > 40 ? "..." : ""} (${date}, 관련도: ${score})`,
		);
	}

	if (results.length > 3) {
		lines.push(`  외 ${results.length - 3}건...`);
	}

	lines.push("상세 조회: /mem-search --layer 3 <id>");

	return lines.join("\n");
}

/**
 * Format search results as context for injection
 */
export function formatContext(
	results: SearchResult[],
	maxTokens: number,
): { context: string; tokenCount: number } {
	if (results.length === 0) {
		return { context: "", tokenCount: 0 };
	}

	const lines: string[] = ["📝 관련 기억:"];
	let tokenCount = estimateTokens(lines[0]);

	for (const result of results) {
		const date = result.createdAt
			? result.createdAt.toLocaleDateString("ko-KR", {
					month: "numeric",
					day: "numeric",
				})
			: "";
		const content = result.content || result.summary || "";
		const preview = content.slice(0, 200) + (content.length > 200 ? "..." : "");

		const line = `- [${date}] ${preview}`;
		const lineTokens = estimateTokens(line);

		if (tokenCount + lineTokens > maxTokens) {
			break;
		}

		lines.push(line);
		tokenCount += lineTokens;
	}

	// If only header, return empty
	if (lines.length === 1) {
		return { context: "", tokenCount: 0 };
	}

	return {
		context: lines.join("\n"),
		tokenCount,
	};
}

/**
 * UserPromptSubmit Hook implementation
 */
export async function userPromptSubmitHook(
	context: UserPromptSubmitContext,
	options?: {
		config?: Partial<Config>;
		client?: DBClient;
		engine?: SearchEngine;
	},
): Promise<UserPromptSubmitResult> {
	const { prompt, projectPath } = context;

	// Extract keywords
	const keywords = extractKeywords(prompt);

	// If no keywords, return empty result
	if (keywords.length === 0) {
		return {
			notification: "",
			injectedContext: "",
			tokenCount: 0,
			relatedMemories: [],
		};
	}

	// Load config
	const config = options?.config
		? { ...loadConfig(projectPath), ...options.config }
		: loadConfig(projectPath);

	// Initialize DB and search engine
	ensureProjectDirs(projectPath);
	const dbPath = getProjectDBPath(projectPath);

	const client = options?.client ?? createDBClient(dbPath);
	const engine = options?.engine ?? createSearchEngine(client);

	// Search with extracted keywords
	const searchQuery = keywords.join(" ");
	const searchOptions: SearchOptions = {
		limit: config.search.default_limit,
		layer: 2, // Need dates for notification
		projectPath,
	};

	let results: SearchResult[] = [];
	try {
		results = engine.search(searchQuery, searchOptions);
	} catch {
		// Search failed, return empty result gracefully
		if (!options?.client) {
			client.close();
		}
		return {
			notification: "",
			injectedContext: "",
			tokenCount: 0,
			relatedMemories: [],
		};
	}

	// Format notification
	const notification = formatNotification(results);

	// Format context if auto_inject is enabled
	let injectedContext = "";
	let tokenCount = 0;

	if (config.memory.auto_inject && results.length > 0) {
		// Re-search with layer 3 for full content
		const fullResults = engine.search(searchQuery, {
			...searchOptions,
			layer: 3,
			limit: 5, // Limit for context injection
		});

		const formatted = formatContext(
			fullResults,
			config.memory.max_inject_tokens,
		);
		injectedContext = formatted.context;
		tokenCount = formatted.tokenCount;
	}

	// Close if we created the client
	if (!options?.client) {
		client.close();
	}

	return {
		notification,
		injectedContext,
		tokenCount,
		relatedMemories: results,
	};
}
