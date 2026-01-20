/**
 * /mem-forget Skill
 *
 * Remove specific memory entries.
 *
 * See: docs/issues/026-mem-forget-skill/README.md
 */

import type { DBClient } from "../core/db/client";
import type { Observation } from "../core/db/types";

/**
 * Skill arguments
 */
export interface MemForgetArgs {
	id?: string;
	sessionId?: string;
	before?: string; // e.g., "7d", "30d", "2024-01-01"
	confirm?: boolean;
}

/**
 * Skill result
 */
export interface MemForgetResult {
	success: boolean;
	deletedCount: number;
	targets?: Array<{ id: string; content: string }>;
	message: string;
	requiresConfirmation?: boolean;
	error?: string;
}

/**
 * Skill context
 */
export interface MemForgetContext {
	sessionId: string;
	client: DBClient;
}

/**
 * Parse duration string to date
 * e.g., "7d" -> 7 days ago, "30d" -> 30 days ago
 */
function parseBefore(before: string): Date | null {
	// Try ISO date format first
	const isoDate = new Date(before);
	if (!Number.isNaN(isoDate.getTime())) {
		return isoDate;
	}

	// Try duration format (e.g., "7d", "30d")
	const match = before.match(/^(\d+)d$/);
	if (match) {
		const days = Number.parseInt(match[1], 10);
		const date = new Date();
		date.setDate(date.getDate() - days);
		return date;
	}

	return null;
}

/**
 * Parse /mem-forget arguments
 */
export function parseMemForgetArgs(argsString: string): MemForgetArgs {
	const args: MemForgetArgs = {};

	// Tokenize
	const tokens: string[] = [];
	let current = "";
	let inQuotes = false;
	let quoteChar = "";

	for (const char of argsString) {
		if ((char === '"' || char === "'") && !inQuotes) {
			inQuotes = true;
			quoteChar = char;
		} else if (char === quoteChar && inQuotes) {
			inQuotes = false;
			quoteChar = "";
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

		if (token === "--session" && i + 1 < tokens.length) {
			args.sessionId = tokens[i + 1];
			i += 2;
		} else if (token === "--before" && i + 1 < tokens.length) {
			args.before = tokens[i + 1];
			i += 2;
		} else if (token === "--confirm") {
			args.confirm = true;
			i++;
		} else if (!token.startsWith("--") && !args.id) {
			args.id = token;
			i++;
		} else {
			i++;
		}
	}

	return args;
}

/**
 * Format preview message
 */
export function formatPreviewMessage(
	targets: Array<{ id: string; content: string }>,
): string {
	if (targets.length === 0) {
		return "삭제 대상 없음";
	}

	const lines = targets.slice(0, 5).map((t) => {
		const content =
			t.content.length > 40 ? `${t.content.slice(0, 37)}...` : t.content;
		return `- ${t.id}: ${content}`;
	});

	if (targets.length > 5) {
		lines.push(`... 외 ${targets.length - 5}개`);
	}

	return `⚠️ 삭제 대상:
${lines.join("\n")}

삭제하려면: /mem-forget ${targets[0].id} --confirm`;
}

/**
 * Format success message
 */
export function formatSuccessMessage(deletedCount: number): string {
	return `✅ 삭제됨: ${deletedCount}개 observation`;
}

/**
 * Get targets for deletion
 */
function getTargets(
	client: DBClient,
	args: MemForgetArgs,
	currentSessionId: string,
): Observation[] {
	if (args.id) {
		// Single ID deletion
		const obs = client.getObservation(args.id);
		return obs ? [obs] : [];
	}

	if (args.sessionId) {
		// Session-wide deletion
		return client.listObservations(args.sessionId, 1000);
	}

	if (args.before) {
		// Date-based deletion
		const date = parseBefore(args.before);
		if (!date) {
			return [];
		}

		const dateStr = date.toISOString();
		const rows = client.db
			.prepare(
				`
				SELECT * FROM observations
				WHERE session_id = ? AND created_at < ?
				ORDER BY created_at ASC
			`,
			)
			.all(currentSessionId, dateStr) as Observation[];

		return rows;
	}

	return [];
}

/**
 * Delete observations
 *
 * Note: We count successful deletions by checking if changes > 0,
 * rather than summing changes directly, because bun:sqlite's changes
 * includes side effects from FTS5 triggers (not just the primary DELETE).
 */
function deleteObservations(client: DBClient, ids: string[]): number {
	if (ids.length === 0) return 0;

	let deleted = 0;
	for (const id of ids) {
		const result = client.db
			.prepare("DELETE FROM observations WHERE id = ?")
			.run(id);
		// Each ID-based delete can only affect 0 or 1 row
		if (result.changes > 0) {
			deleted += 1;
		}
	}

	return deleted;
}

/**
 * Forget memory entries
 */
export function forgetMemory(
	context: MemForgetContext,
	args: MemForgetArgs,
): MemForgetResult {
	const { sessionId, client } = context;

	// Check if any criteria specified
	if (!args.id && !args.sessionId && !args.before) {
		return {
			success: false,
			deletedCount: 0,
			message: "",
			error:
				"삭제 대상을 지정해주세요. 사용법: /mem-forget <id> 또는 --before <일수>d",
		};
	}

	// Get targets
	const targets = getTargets(client, args, sessionId);

	if (targets.length === 0) {
		return {
			success: false,
			deletedCount: 0,
			message: "삭제 대상 없음",
		};
	}

	// If no --confirm, return preview
	if (!args.confirm) {
		const targetSummary = targets.map((t) => ({
			id: t.id,
			content: t.content,
		}));

		return {
			success: false,
			deletedCount: 0,
			targets: targetSummary,
			message: formatPreviewMessage(targetSummary),
			requiresConfirmation: true,
		};
	}

	// Perform deletion
	const ids = targets.map((t) => t.id);
	const deletedCount = deleteObservations(client, ids);

	return {
		success: true,
		deletedCount,
		message: formatSuccessMessage(deletedCount),
	};
}

/**
 * Create mem-forget skill instance
 */
export function createMemForgetSkill(context: MemForgetContext) {
	return {
		name: "/mem-forget" as const,

		execute(args: MemForgetArgs): MemForgetResult {
			return forgetMemory(context, args);
		},

		parseArgs(argsString: string): MemForgetArgs {
			return parseMemForgetArgs(argsString);
		},
	};
}

/**
 * Execute /mem-forget command
 */
export async function executeMemForget(
	argsString: string,
	context: MemForgetContext,
): Promise<string> {
	const args = parseMemForgetArgs(argsString);
	const result = forgetMemory(context, args);

	if (result.error) {
		return `❌ ${result.error}`;
	}

	return result.message;
}

// Legacy interface for backward compatibility
export interface MemForgetInput {
	id?: string;
	pattern?: string;
	before?: string;
}

export interface MemForgetOutput {
	success: boolean;
	deletedCount: number;
	message: string;
}

export async function memForgetSkill(
	_input: MemForgetInput,
): Promise<MemForgetOutput> {
	// Legacy function - use createMemForgetSkill instead
	return {
		success: false,
		deletedCount: 0,
		message: "Use createMemForgetSkill() for full functionality",
	};
}
