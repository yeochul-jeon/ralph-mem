/**
 * SessionEnd Hook
 *
 * Triggered when a Claude Code session ends.
 * Generates and stores session summary.
 *
 * See: docs/design/hook-layer.md
 */

import { type DBClient, createDBClient } from "../core/db/client";
import { ensureProjectDirs, getProjectDBPath } from "../core/db/paths";
import type { ObservationType } from "../core/db/types";
import { type MemoryStore, createMemoryStore } from "../core/store";

export type SessionEndReason = "user" | "timeout" | "error";

export interface SessionEndContext {
	sessionId: string;
	projectPath: string;
	reason?: SessionEndReason;
}

export interface SessionEndResult {
	summary: string;
	observationCount: number;
	tokenCount: number;
	toolStats: Record<string, number>;
}

/**
 * Generate a simple summary from observations
 */
function generateSummary(
	observations: Array<{
		type: ObservationType;
		tool_name: string | null;
		content: string;
	}>,
): { summary: string; toolStats: Record<string, number> } {
	if (observations.length === 0) {
		return { summary: "세션에서 기록된 작업이 없습니다.", toolStats: {} };
	}

	// Count observation types
	const typeCounts: Record<string, number> = {};
	const toolStats: Record<string, number> = {};

	for (const obs of observations) {
		typeCounts[obs.type] = (typeCounts[obs.type] || 0) + 1;
		if (obs.tool_name) {
			toolStats[obs.tool_name] = (toolStats[obs.tool_name] || 0) + 1;
		}
	}

	// Build summary parts
	const parts: string[] = [];

	// Tool usage
	const toolEntries = Object.entries(toolStats);
	if (toolEntries.length > 0) {
		const topTools = toolEntries
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([name, count]) => `${name}(${count})`)
			.join(", ");
		parts.push(`주요 도구: ${topTools}`);
	}

	// Errors and successes
	if (typeCounts.error && typeCounts.error > 0) {
		parts.push(`에러 ${typeCounts.error}건 발생`);
	}
	if (typeCounts.success && typeCounts.success > 0) {
		parts.push(`성공 ${typeCounts.success}건`);
	}

	// Notes summary
	const notes = observations.filter((o) => o.type === "note");
	if (notes.length > 0) {
		// Get the last note as the most representative
		const lastNote = notes[notes.length - 1];
		const notePreview =
			lastNote.content.slice(0, 50) +
			(lastNote.content.length > 50 ? "..." : "");
		parts.push(`마지막 메모: ${notePreview}`);
	}

	const summary =
		parts.length > 0 ? parts.join(". ") : `작업 ${observations.length}건 처리`;

	return { summary, toolStats };
}

/**
 * SessionEnd Hook implementation
 */
export async function sessionEndHook(
	context: SessionEndContext,
	options?: {
		client?: DBClient;
		store?: MemoryStore;
	},
): Promise<SessionEndResult> {
	const { sessionId, projectPath, reason = "user" } = context;

	// Initialize DB and store
	ensureProjectDirs(projectPath);
	const dbPath = getProjectDBPath(projectPath);

	const client = options?.client ?? createDBClient(dbPath);
	const store = options?.store ?? createMemoryStore(client);

	// Check if session exists
	const session = client.getSession(sessionId);
	if (!session) {
		// Session doesn't exist or already ended
		return {
			summary: "",
			observationCount: 0,
			tokenCount: 0,
			toolStats: {},
		};
	}

	// Check if already ended
	if (session.ended_at) {
		return {
			summary: session.summary || "",
			observationCount: 0,
			tokenCount: session.token_count,
			toolStats: {},
		};
	}

	// Get all observations for this session
	const observations = client.listObservations(sessionId, 1000);

	// Generate summary
	const { summary, toolStats } = generateSummary(observations);

	// Add reason to summary if not user-initiated
	const finalSummary = reason !== "user" ? `[${reason}] ${summary}` : summary;

	// End the session with summary
	client.endSession(sessionId, finalSummary);

	// Get final token count
	const updatedSession = client.getSession(sessionId);

	// Close if we created the client
	if (!options?.client) {
		client.close();
	}

	return {
		summary: finalSummary,
		observationCount: observations.length,
		tokenCount: updatedSession?.token_count ?? 0,
		toolStats,
	};
}

export { generateSummary };
