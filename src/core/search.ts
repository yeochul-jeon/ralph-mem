/**
 * Search Engine
 *
 * FTS5-based full-text search with embedding fallback.
 * See: docs/design/core-layer.md
 */

export type ObservationType = "tool_use" | "bash" | "error" | "success" | "note";

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
  // Layer 3
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchEngine {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  searchByEmbedding?(embedding: number[]): Promise<SearchResult[]>;
}

// Placeholder implementation - to be completed in Issue #007
export function createSearchEngine(): SearchEngine {
  throw new Error("Not implemented - see Issue #007");
}
