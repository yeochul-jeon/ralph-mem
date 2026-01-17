/**
 * SessionStart Hook
 *
 * Triggered when a new Claude Code session starts.
 * Creates a new session and injects relevant memory context from previous sessions.
 *
 * See: docs/design/hook-layer.md
 */

import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { type DBClient, createDBClient } from "../core/db/client";
import {
	ensureProjectDirs,
	getBackupsDir,
	getProjectDBPath,
} from "../core/db/paths";
import { type MemoryStore, createMemoryStore } from "../core/store";
import { estimateTokens } from "../core/store";
import { type Config, loadConfig } from "../utils/config";

export interface SessionStartContext {
	projectPath: string;
}

export interface SessionStartResult {
	sessionId: string;
	injectedContext: string;
	tokenCount: number;
	metadata: {
		previousSessions: number;
		backupPath?: string;
	};
}

/**
 * Create a backup of the database before starting a new session
 */
function backupDatabase(projectPath: string): string | undefined {
	const dbPath = getProjectDBPath(projectPath);

	if (!existsSync(dbPath)) {
		return undefined;
	}

	const dirs = ensureProjectDirs(projectPath);
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = join(dirs.backupsDir, `memory-${timestamp}.db`);

	copyFileSync(dbPath, backupPath);

	return backupPath;
}

/**
 * Format previous session summaries for context injection
 */
function formatSessionContext(
	sessions: Array<{ summary: string | null; started_at: string }>,
	maxTokens: number,
): { context: string; tokenCount: number } {
	if (sessions.length === 0) {
		return { context: "", tokenCount: 0 };
	}

	const lines: string[] = ["📝 이전 세션 컨텍스트:"];
	let tokenCount = estimateTokens(lines[0]);

	for (const session of sessions) {
		if (!session.summary) continue;

		const date = new Date(session.started_at).toLocaleDateString("ko-KR", {
			month: "numeric",
			day: "numeric",
		});
		const line = `- [${date}] ${session.summary}`;
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
 * SessionStart Hook implementation
 */
export async function sessionStartHook(
	context: SessionStartContext,
	options?: {
		config?: Partial<Config>;
		client?: DBClient;
		store?: MemoryStore;
	},
): Promise<SessionStartResult> {
	const { projectPath } = context;

	// Load config
	const config = options?.config
		? { ...loadConfig(projectPath), ...options.config }
		: loadConfig(projectPath);

	// Backup database
	const backupPath = backupDatabase(projectPath);

	// Initialize DB and store
	const dbPath = getProjectDBPath(projectPath);
	ensureProjectDirs(projectPath);

	const client = options?.client ?? createDBClient(dbPath);
	const store = options?.store ?? createMemoryStore(client);

	// Get previous sessions for context
	const previousSessions = client.listSessions(projectPath, 10);

	// Create new session
	const session = store.createSession(projectPath);

	// Generate context if auto_inject is enabled
	let injectedContext = "";
	let tokenCount = 0;

	if (config.memory.auto_inject) {
		const sessionsWithSummary = previousSessions.filter((s) => s.summary);
		const formatted = formatSessionContext(
			sessionsWithSummary,
			config.memory.max_inject_tokens,
		);
		injectedContext = formatted.context;
		tokenCount = formatted.tokenCount;
	}

	// Don't close if client was provided externally
	if (!options?.client) {
		// Keep store/client alive for the session - don't close
	}

	return {
		sessionId: session.id,
		injectedContext,
		tokenCount,
		metadata: {
			previousSessions: previousSessions.length,
			backupPath,
		},
	};
}

export { backupDatabase, formatSessionContext };
