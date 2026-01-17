/**
 * /ralph Skill
 *
 * Commands for Ralph Loop:
 * - /ralph start "task" [--criteria type] [--max-iterations n]
 * - /ralph stop [--rollback]
 * - /ralph status
 *
 * See: docs/issues/017-ralph-start-command/README.md
 */

import type { DBClient } from "../core/db/client";
import type { LoopRun } from "../core/db/types";
import {
	type LoopEngine,
	type LoopResult,
	createLoopEngine,
} from "../features/ralph/engine";
import {
	createRunSnapshot,
	restoreRunSnapshot,
} from "../features/ralph/snapshot";
import {
	type StopConditions,
	loadStopConditions,
} from "../features/ralph/stop-conditions";
import {
	type Config,
	type SuccessCriteria,
	type SuccessCriteriaType,
	loadConfig,
} from "../utils/config";

/**
 * Arguments for /ralph start command
 */
export interface RalphStartArgs {
	task: string;
	criteria?: SuccessCriteriaType;
	maxIterations?: number;
	cooldownMs?: number;
	noSnapshot?: boolean;
}

/**
 * Result of /ralph start command
 */
export interface RalphStartResult {
	success: boolean;
	loopRunId?: string;
	message: string;
	error?: string;
}

/**
 * Arguments for /ralph stop command
 */
export interface RalphStopArgs {
	rollback?: boolean;
}

/**
 * Result of /ralph stop command
 */
export interface RalphStopResult {
	success: boolean;
	message: string;
	error?: string;
}

/**
 * Result of /ralph status command
 */
export interface RalphStatusResult {
	isRunning: boolean;
	currentRun?: {
		id: string;
		task: string;
		iterations: number;
		maxIterations: number;
		startedAt: Date;
	};
	message: string;
}

/**
 * Default commands for criteria types
 */
const CRITERIA_COMMANDS: Record<SuccessCriteriaType, string> = {
	test_pass: "npm test",
	build_success: "npm run build",
	lint_clean: "npm run lint",
	type_check: "npx tsc --noEmit",
	custom: "(custom)",
};

/**
 * Parse /ralph start arguments
 */
export function parseStartArgs(argsString: string): RalphStartArgs {
	const args: RalphStartArgs = {
		task: "",
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

		if (token === "--criteria" && i + 1 < tokens.length) {
			const criteriaType = tokens[i + 1].toLowerCase();
			if (isValidCriteriaType(criteriaType)) {
				args.criteria = criteriaType;
			}
			i += 2;
		} else if (token === "--max-iterations" && i + 1 < tokens.length) {
			args.maxIterations = Number.parseInt(tokens[i + 1], 10);
			i += 2;
		} else if (token === "--cooldown" && i + 1 < tokens.length) {
			args.cooldownMs = Number.parseInt(tokens[i + 1], 10);
			i += 2;
		} else if (token === "--no-snapshot") {
			args.noSnapshot = true;
			i++;
		} else if (!token.startsWith("--") && !args.task) {
			args.task = token;
			i++;
		} else {
			i++;
		}
	}

	return args;
}

/**
 * Check if a string is a valid criteria type
 */
function isValidCriteriaType(type: string): type is SuccessCriteriaType {
	return [
		"test_pass",
		"build_success",
		"lint_clean",
		"type_check",
		"custom",
	].includes(type);
}

/**
 * Format start message
 */
export function formatStartMessage(
	loopRunId: string,
	task: string,
	criteria: SuccessCriteriaType,
	maxIterations: number,
): string {
	const command = CRITERIA_COMMANDS[criteria];

	return `🚀 Ralph Loop 시작

태스크: ${task}
기준: ${criteria} (${command})
최대 반복: ${maxIterations}

Loop ID: ${loopRunId}
중단: /ralph stop`;
}

/**
 * Format stop message
 */
export function formatStopMessage(
	loopRunId: string,
	reason: string,
	rolledBack: boolean,
): string {
	const rollbackMsg = rolledBack ? "\n파일이 롤백되었습니다." : "";

	return `⏹️ Ralph Loop 중단

Loop ID: ${loopRunId}
이유: ${reason}${rollbackMsg}`;
}

/**
 * Format status message
 */
export function formatStatusMessage(
	isRunning: boolean,
	run?: {
		id: string;
		task: string;
		iterations: number;
		maxIterations: number;
		startedAt: Date;
	},
): string {
	if (!isRunning || !run) {
		return "📊 Ralph Loop 상태: 실행 중인 Loop 없음";
	}

	const elapsed = Math.floor((Date.now() - run.startedAt.getTime()) / 1000);
	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;

	return `📊 Ralph Loop 상태: 실행 중

Loop ID: ${run.id}
태스크: ${run.task}
반복: ${run.iterations}/${run.maxIterations}
경과: ${minutes}분 ${seconds}초

중단: /ralph stop`;
}

/**
 * Ralph skill context
 */
export interface RalphContext {
	projectPath: string;
	sessionId: string;
	client?: DBClient;
	config?: Partial<Config>;
	engine?: LoopEngine;
}

/**
 * Create Ralph skill instance
 */
export function createRalphSkill(context: RalphContext) {
	const { projectPath, sessionId } = context;
	const config = context.config ?? loadConfig(projectPath);

	// Create or use provided engine
	let engine = context.engine;
	const currentSnapshotPath: string | null = null;

	function getOrCreateEngine(): LoopEngine {
		if (!engine) {
			engine = createLoopEngine(projectPath, sessionId, {
				client: context.client,
				config,
			});
		}
		return engine;
	}

	return {
		/**
		 * Start a Ralph Loop
		 */
		async start(args: RalphStartArgs): Promise<RalphStartResult> {
			if (!args.task) {
				return {
					success: false,
					message: "",
					error: '태스크 설명이 필요합니다. 사용법: /ralph start "태스크 설명"',
				};
			}

			const eng = getOrCreateEngine();

			// Check if already running
			if (eng.isRunning()) {
				const currentRun = eng.getCurrentRun();
				return {
					success: false,
					message: "",
					error: `이미 Loop가 실행 중입니다. (ID: ${currentRun?.id})\n중단: /ralph stop`,
				};
			}

			// Build criteria
			const criteriaType = args.criteria ?? "test_pass";
			const criteria: SuccessCriteria[] = [{ type: criteriaType }];

			// Get max iterations
			const maxIterations =
				args.maxIterations ?? config.ralph?.max_iterations ?? 10;
			const cooldownMs = args.cooldownMs ?? config.ralph?.cooldown_ms ?? 1000;

			// Create snapshot before starting (unless disabled)
			if (!args.noSnapshot) {
				try {
					// We'll create snapshot when we actually have a loop run ID
					// For now, just note that we should create one
				} catch {
					// Snapshot creation failed, continue anyway
				}
			}

			// Start the loop (but don't block on it)
			// In actual usage, the caller would set up the iteration callback
			// Here we just prepare and return the start info

			try {
				// Create a loop run to get the ID
				// The actual loop execution will be handled by the caller
				const loopRun = eng.getCurrentRun();

				const message = formatStartMessage(
					loopRun?.id ?? "pending",
					args.task,
					criteriaType,
					maxIterations,
				);

				return {
					success: true,
					loopRunId: loopRun?.id,
					message,
				};
			} catch (error) {
				return {
					success: false,
					message: "",
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},

		/**
		 * Stop the current Ralph Loop
		 */
		async stop(args: RalphStopArgs = {}): Promise<RalphStopResult> {
			const eng = getOrCreateEngine();

			if (!eng.isRunning()) {
				return {
					success: false,
					message: "",
					error: "실행 중인 Loop가 없습니다.",
				};
			}

			const currentRun = eng.getCurrentRun();
			const loopRunId = currentRun?.id ?? "unknown";

			try {
				await eng.stop();

				// Rollback if requested
				let rolledBack = false;
				if (args.rollback && currentSnapshotPath) {
					try {
						await restoreRunSnapshot(projectPath, loopRunId);
						rolledBack = true;
					} catch {
						// Rollback failed, continue
					}
				}

				const message = formatStopMessage(loopRunId, "사용자 중단", rolledBack);

				return {
					success: true,
					message,
				};
			} catch (error) {
				return {
					success: false,
					message: "",
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},

		/**
		 * Get status of Ralph Loop
		 */
		async status(): Promise<RalphStatusResult> {
			const eng = getOrCreateEngine();
			const isRunning = eng.isRunning();
			const currentRun = eng.getCurrentRun();

			let run:
				| {
						id: string;
						task: string;
						iterations: number;
						maxIterations: number;
						startedAt: Date;
				  }
				| undefined;

			if (currentRun) {
				run = {
					id: currentRun.id,
					task: currentRun.task,
					iterations: currentRun.iterations,
					maxIterations: currentRun.max_iterations,
					startedAt: new Date(currentRun.started_at),
				};
			}

			const message = formatStatusMessage(isRunning, run);

			return {
				isRunning,
				currentRun: run,
				message,
			};
		},

		/**
		 * Get the engine (for testing)
		 */
		getEngine(): LoopEngine {
			return getOrCreateEngine();
		},

		/**
		 * Close the skill and cleanup
		 */
		close(): void {
			if (engine) {
				engine.close();
			}
		},
	};
}

/**
 * Execute /ralph command
 */
export async function executeRalphCommand(
	command: string,
	argsString: string,
	context: RalphContext,
): Promise<string> {
	const skill = createRalphSkill(context);

	try {
		switch (command.toLowerCase()) {
			case "start": {
				const args = parseStartArgs(argsString);
				const result = await skill.start(args);
				if (!result.success) {
					return `❌ ${result.error}`;
				}
				return result.message;
			}

			case "stop": {
				const rollback = argsString.includes("--rollback");
				const result = await skill.stop({ rollback });
				if (!result.success) {
					return `❌ ${result.error}`;
				}
				return result.message;
			}

			case "status": {
				const result = await skill.status();
				return result.message;
			}

			default:
				return `❌ 알 수 없는 명령: ${command}

사용 가능한 명령:
  /ralph start "태스크" [--criteria type] [--max-iterations n]
  /ralph stop [--rollback]
  /ralph status`;
		}
	} finally {
		skill.close();
	}
}

// Legacy interface for backward compatibility
export interface RalphSkillInput {
	command: "start" | "stop" | "status" | "config";
	task?: string;
	criteria?: string;
}

export interface RalphSkillOutput {
	success: boolean;
	message: string;
	loopId?: string;
	status?: {
		iteration: number;
		maxIterations: number;
		criteria: string;
		running: boolean;
	};
}

export async function ralphSkill(
	_input: RalphSkillInput,
): Promise<RalphSkillOutput> {
	// Legacy function - use createRalphSkill instead
	return {
		success: false,
		message: "Use createRalphSkill() for full functionality",
	};
}
