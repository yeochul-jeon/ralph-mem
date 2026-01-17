/**
 * Search Engine
 *
 * FTS5-based full-text search with Progressive Disclosure.
 * See: docs/design/core-layer.md
 */

import type { DBClient } from "./db/client";
import { createDBClient } from "./db/client";
import type { ObservationType } from "./db/types";

export type { ObservationType };

export interface SearchOptions {
	limit?: number;
	layer?: 1 | 2 | 3;
	since?: Date;
	types?: ObservationType[];
	projectPath?: string;
}

export interface SearchResult {
	id: string;
	score: number;
	// Layer 1
	summary?: string;
	// Layer 2
	createdAt?: Date;
	sessionId?: string;
	type?: ObservationType;
	toolName?: string;
	// Layer 3
	content?: string;
	metadata?: Record<string, unknown>;
}

export interface SearchEngine {
	search(query: string, options?: SearchOptions): SearchResult[];
	close(): void;
}

/**
 * Escape special FTS5 characters in query
 */
function escapeFtsQuery(query: string): string {
	// Remove FTS5 special operators and wrap in quotes for literal search
	// Special chars: " ( ) * : ^ -
	const escaped = query
		.replace(/"/g, '""') // Escape quotes
		.trim();

	if (!escaped) return "";

	// Split into words and create OR query for partial matching
	const words = escaped.split(/\s+/).filter((w) => w.length > 0);
	if (words.length === 0) return "";

	// Use prefix matching with * for better search experience
	return words.map((w) => `"${w}"*`).join(" OR ");
}

/**
 * Create a Search Engine instance
 */
export function createSearchEngine(
	dbPathOrClient: string | ":memory:" | DBClient,
): SearchEngine {
	const client: DBClient =
		typeof dbPathOrClient === "string"
			? createDBClient(dbPathOrClient)
			: dbPathOrClient;

	return {
		search(query: string, options: SearchOptions = {}): SearchResult[] {
			const { limit = 10, layer = 1, since, types, projectPath } = options;

			const escapedQuery = escapeFtsQuery(query);
			if (!escapedQuery) return [];

			// Build WHERE clauses for filters
			const whereClauses: string[] = [];
			const params: unknown[] = [];

			if (since) {
				whereClauses.push("o.created_at >= ?");
				params.push(since.toISOString());
			}

			if (types && types.length > 0) {
				const placeholders = types.map(() => "?").join(", ");
				whereClauses.push(`o.type IN (${placeholders})`);
				params.push(...types);
			}

			if (projectPath) {
				whereClauses.push("s.project_path = ?");
				params.push(projectPath);
			}

			const whereClause =
				whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : "";

			// FTS5 search with BM25 scoring
			// Join with observations and sessions for filtering
			const sql = `
        SELECT
          o.id,
          o.session_id,
          o.type,
          o.tool_name,
          o.content,
          o.importance,
          o.created_at,
          s.project_path,
          bm25(observations_fts) as score
        FROM observations_fts fts
        JOIN observations o ON fts.rowid = o.rowid
        JOIN sessions s ON o.session_id = s.id
        WHERE observations_fts MATCH ?
        ${whereClause}
        ORDER BY score
        LIMIT ?
      `;

			params.unshift(escapedQuery);
			params.push(limit);

			const rows = client.db.prepare(sql).all(...params) as Array<{
				id: string;
				session_id: string;
				type: ObservationType;
				tool_name: string | null;
				content: string;
				importance: number;
				created_at: string;
				project_path: string;
				score: number;
			}>;

			return rows.map((row) => {
				// BM25 returns negative scores (lower is better), convert to positive
				const normalizedScore = Math.abs(row.score);

				const result: SearchResult = {
					id: row.id,
					score: normalizedScore,
				};

				// Layer 1: Basic info
				result.summary =
					row.content.slice(0, 100) + (row.content.length > 100 ? "..." : "");

				// Layer 2: More context
				if (layer >= 2) {
					result.createdAt = new Date(row.created_at);
					result.sessionId = row.session_id;
					result.type = row.type;
					result.toolName = row.tool_name ?? undefined;
				}

				// Layer 3: Full details
				if (layer >= 3) {
					result.content = row.content;
					result.metadata = {
						importance: row.importance,
						projectPath: row.project_path,
					};
				}

				return result;
			});
		},

		close(): void {
			client.close();
		},
	};
}
