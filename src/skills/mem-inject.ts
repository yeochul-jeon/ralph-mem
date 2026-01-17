/**
 * /mem-inject Skill
 *
 * Manually inject context into memory.
 *
 * See: docs/issues/025-mem-inject-skill/README.md
 */

import type { DBClient } from "../core/db/client";
import type { ObservationType } from "../core/db/types";

/**
 * Skill arguments
 */
export interface MemInjectArgs {
	content: string;
	type?: "note" | "context";
	importance?: number;
}

/**
 * Skill result
 */
export interface MemInjectResult {
	success: boolean;
	observationId?: string;
	message: string;
	error?: string;
}

/**
 * Skill context
 */
export interface MemInjectContext {
	sessionId: string;
	client: DBClient;
}

/**
 * Default importance for injected notes
 */
const DEFAULT_IMPORTANCE = 0.7;

/**
 * Parse /mem-inject arguments
 */
export function parseMemInjectArgs(argsString: string): MemInjectArgs {
	const args: MemInjectArgs = {
		content: "",
	};

	// Tokenize preserving quoted strings
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

		if (token === "--importance" && i + 1 < tokens.length) {
			const value = Number.parseFloat(tokens[i + 1]);
			if (!Number.isNaN(value) && value >= 0 && value <= 1) {
				args.importance = value;
			}
			i += 2;
		} else if (token === "--type" && i + 1 < tokens.length) {
			const typeValue = tokens[i + 1].toLowerCase();
			if (typeValue === "note" || typeValue === "context") {
				args.type = typeValue;
			}
			i += 2;
		} else if (!token.startsWith("--") && !args.content) {
			args.content = token;
			i++;
		} else {
			i++;
		}
	}

	return args;
}

/**
 * Format success message
 */
export function formatInjectSuccess(
	observationId: string,
	content: string,
	importance: number,
): string {
	// Truncate content if too long
	const displayContent =
		content.length > 100 ? `${content.slice(0, 97)}...` : content;

	return `✅ 메모리에 추가됨

ID: ${observationId}
내용: ${displayContent}
중요도: ${importance}`;
}

/**
 * Inject content into memory
 */
export function injectMemory(
	context: MemInjectContext,
	args: MemInjectArgs,
): MemInjectResult {
	const { sessionId, client } = context;

	if (!args.content || args.content.trim() === "") {
		return {
			success: false,
			message: "",
			error: '내용이 필요합니다. 사용법: /mem-inject "내용"',
		};
	}

	const importance = args.importance ?? DEFAULT_IMPORTANCE;
	const type: ObservationType = "note";

	try {
		const observation = client.createObservation({
			session_id: sessionId,
			type,
			content: args.content.trim(),
			importance,
		});

		const message = formatInjectSuccess(
			observation.id,
			observation.content,
			importance,
		);

		return {
			success: true,
			observationId: observation.id,
			message,
		};
	} catch (error) {
		return {
			success: false,
			message: "",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Create mem-inject skill instance
 */
export function createMemInjectSkill(context: MemInjectContext) {
	return {
		name: "/mem-inject" as const,

		execute(args: MemInjectArgs): MemInjectResult {
			return injectMemory(context, args);
		},

		parseArgs(argsString: string): MemInjectArgs {
			return parseMemInjectArgs(argsString);
		},
	};
}

/**
 * Execute /mem-inject command
 */
export async function executeMemInject(
	argsString: string,
	context: MemInjectContext,
): Promise<string> {
	const args = parseMemInjectArgs(argsString);
	const result = injectMemory(context, args);

	if (!result.success) {
		return `❌ ${result.error}`;
	}

	return result.message;
}

// Legacy interface for backward compatibility
export interface MemInjectInput {
	content: string;
	type?: "note" | "context";
	importance?: number;
}

export interface MemInjectOutput {
	success: boolean;
	observationId?: string;
	message: string;
}

export async function memInjectSkill(
	_input: MemInjectInput,
): Promise<MemInjectOutput> {
	// Legacy function - use createMemInjectSkill instead
	return {
		success: false,
		message: "Use createMemInjectSkill() for full functionality",
	};
}
