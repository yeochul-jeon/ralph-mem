/**
 * Error Handling and Graceful Degradation
 *
 * Error levels and recovery strategies:
 * - Low: Log only, continue execution
 * - Medium: Attempt fallback, notify user
 * - High: Request user choice
 *
 * See: docs/issues/028-error-handling/README.md
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	renameSync,
	statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { LogLevel } from "./config";

/**
 * Error severity level
 */
export type ErrorLevel = "low" | "medium" | "high";

/**
 * Extended error interface
 */
export interface RalphError extends Error {
	level: ErrorLevel;
	recoverable: boolean;
	context?: Record<string, unknown>;
	code?: string;
	timestamp: Date;
}

/**
 * Error recovery options
 */
export interface RecoveryOption {
	id: string;
	label: string;
	description?: string;
}

/**
 * Recovery choice result
 */
export interface RecoveryChoice {
	optionId: string;
	error: RalphError;
}

/**
 * Error handler callback
 */
export type ErrorHandler = (error: RalphError) => void;

/**
 * Recovery handler callback
 */
export type RecoveryHandler = (
	error: RalphError,
	options: RecoveryOption[],
) => Promise<RecoveryChoice>;

/**
 * Fallback function type
 */
export type FallbackFunction<T> = () => T | Promise<T>;

/**
 * Error codes
 */
export const ErrorCodes = {
	// Database errors
	DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
	DB_QUERY_FAILED: "DB_QUERY_FAILED",
	DB_WRITE_FAILED: "DB_WRITE_FAILED",

	// Search errors
	SEARCH_FAILED: "SEARCH_FAILED",
	FTS_FAILED: "FTS_FAILED",
	EMBEDDING_FAILED: "EMBEDDING_FAILED",

	// Config errors
	CONFIG_INVALID: "CONFIG_INVALID",
	CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",

	// Loop errors
	LOOP_FAILED: "LOOP_FAILED",
	CRITERIA_CHECK_FAILED: "CRITERIA_CHECK_FAILED",

	// General errors
	UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Create a RalphError
 */
export function createError(
	message: string,
	options: {
		level?: ErrorLevel;
		recoverable?: boolean;
		code?: ErrorCode;
		context?: Record<string, unknown>;
		cause?: Error;
	} = {},
): RalphError {
	const error = new Error(message) as RalphError;

	error.level = options.level ?? "medium";
	error.recoverable = options.recoverable ?? true;
	error.code = options.code ?? ErrorCodes.UNKNOWN_ERROR;
	error.context = options.context;
	error.timestamp = new Date();

	if (options.cause) {
		error.cause = options.cause;
	}

	return error;
}

/**
 * Check if an error is a RalphError
 */
export function isRalphError(error: unknown): error is RalphError {
	return (
		error instanceof Error &&
		"level" in error &&
		"recoverable" in error &&
		"timestamp" in error
	);
}

/**
 * Wrap any error as RalphError
 */
export function wrapError(
	error: unknown,
	level: ErrorLevel = "medium",
): RalphError {
	if (isRalphError(error)) {
		return error;
	}

	if (error instanceof Error) {
		return createError(error.message, {
			level,
			cause: error,
			recoverable: true,
		});
	}

	return createError(String(error), { level, recoverable: true });
}

/**
 * Default recovery options for high-level errors
 */
export const DEFAULT_RECOVERY_OPTIONS: Record<ErrorCode, RecoveryOption[]> = {
	[ErrorCodes.DB_CONNECTION_FAILED]: [
		{ id: "retry", label: "재시도", description: "연결을 다시 시도합니다" },
		{
			id: "continue",
			label: "메모리 기능 없이 계속",
			description: "메모리 기능을 비활성화하고 진행합니다",
		},
		{ id: "abort", label: "세션 중단", description: "현재 세션을 종료합니다" },
	],
	[ErrorCodes.DB_QUERY_FAILED]: [
		{ id: "retry", label: "재시도" },
		{ id: "skip", label: "건너뛰기" },
	],
	[ErrorCodes.DB_WRITE_FAILED]: [
		{ id: "retry", label: "재시도" },
		{
			id: "queue",
			label: "나중에 저장",
			description: "메모리 큐에 보관합니다",
		},
	],
	[ErrorCodes.SEARCH_FAILED]: [
		{ id: "retry", label: "재시도" },
		{ id: "empty", label: "빈 결과 반환" },
	],
	[ErrorCodes.FTS_FAILED]: [
		{ id: "retry", label: "재시도" },
		{ id: "fallback", label: "기본 검색 사용" },
	],
	[ErrorCodes.EMBEDDING_FAILED]: [
		{ id: "skip", label: "임베딩 없이 진행" },
		{ id: "retry", label: "재시도" },
	],
	[ErrorCodes.CONFIG_INVALID]: [
		{ id: "default", label: "기본 설정 사용" },
		{ id: "abort", label: "중단" },
	],
	[ErrorCodes.CONFIG_NOT_FOUND]: [
		{ id: "create", label: "기본 설정 생성" },
		{ id: "continue", label: "기본값으로 진행" },
	],
	[ErrorCodes.LOOP_FAILED]: [
		{ id: "retry", label: "재시도" },
		{ id: "stop", label: "Loop 중단" },
	],
	[ErrorCodes.CRITERIA_CHECK_FAILED]: [
		{ id: "retry", label: "재시도" },
		{ id: "skip", label: "건너뛰기" },
	],
	[ErrorCodes.UNKNOWN_ERROR]: [
		{ id: "retry", label: "재시도" },
		{ id: "abort", label: "중단" },
	],
};

/**
 * Get recovery options for an error
 */
export function getRecoveryOptions(error: RalphError): RecoveryOption[] {
	const code = error.code as ErrorCode | undefined;
	if (code && code in DEFAULT_RECOVERY_OPTIONS) {
		return DEFAULT_RECOVERY_OPTIONS[code];
	}
	return DEFAULT_RECOVERY_OPTIONS[ErrorCodes.UNKNOWN_ERROR];
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
	level: LogLevel;
	file: boolean;
	filePath?: string;
	maxFileSize?: number; // bytes, default 5MB
	maxFiles?: number; // default 3
}

/**
 * Logger implementation
 */
export class Logger {
	private config: LoggerConfig;
	private static LOG_LEVELS: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = {
			level: config.level ?? "info",
			file: config.file ?? false,
			filePath: config.filePath,
			maxFileSize: config.maxFileSize ?? 5 * 1024 * 1024, // 5MB
			maxFiles: config.maxFiles ?? 3,
		};
	}

	/**
	 * Check if a level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		return Logger.LOG_LEVELS[level] >= Logger.LOG_LEVELS[this.config.level];
	}

	/**
	 * Format log message
	 */
	private formatMessage(
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>,
	): string {
		const timestamp = new Date().toISOString();
		const contextStr = context ? ` ${JSON.stringify(context)}` : "";
		return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
	}

	/**
	 * Rotate log files if needed
	 */
	private rotateIfNeeded(): void {
		if (!this.config.filePath || !existsSync(this.config.filePath)) {
			return;
		}

		try {
			const stats = statSync(this.config.filePath);
			if (stats.size >= (this.config.maxFileSize ?? 5 * 1024 * 1024)) {
				// Rotate existing files
				for (let i = (this.config.maxFiles ?? 3) - 1; i >= 1; i--) {
					const oldPath = `${this.config.filePath}.${i}`;
					const newPath = `${this.config.filePath}.${i + 1}`;
					if (existsSync(oldPath)) {
						if (i === (this.config.maxFiles ?? 3) - 1) {
							// Remove oldest
							// We can't use unlinkSync in Bun, just skip
						} else {
							renameSync(oldPath, newPath);
						}
					}
				}
				// Move current to .1
				renameSync(this.config.filePath, `${this.config.filePath}.1`);
			}
		} catch {
			// Ignore rotation errors
		}
	}

	/**
	 * Write to log file
	 */
	private writeToFile(formatted: string): void {
		if (!this.config.file || !this.config.filePath) {
			return;
		}

		try {
			const dir = dirname(this.config.filePath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}

			this.rotateIfNeeded();
			appendFileSync(this.config.filePath, `${formatted}\n`);
		} catch {
			// Ignore file write errors
		}
	}

	/**
	 * Log a message
	 */
	private log(
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>,
	): void {
		if (!this.shouldLog(level)) {
			return;
		}

		const formatted = this.formatMessage(level, message, context);

		// Console output
		switch (level) {
			case "debug":
			case "info":
				console.log(formatted);
				break;
			case "warn":
				console.warn(formatted);
				break;
			case "error":
				console.error(formatted);
				break;
		}

		// File output
		this.writeToFile(formatted);
	}

	debug(message: string, context?: Record<string, unknown>): void {
		this.log("debug", message, context);
	}

	info(message: string, context?: Record<string, unknown>): void {
		this.log("info", message, context);
	}

	warn(message: string, context?: Record<string, unknown>): void {
		this.log("warn", message, context);
	}

	error(message: string, context?: Record<string, unknown>): void {
		this.log("error", message, context);
	}

	/**
	 * Log a RalphError
	 */
	logError(error: RalphError): void {
		const level: LogLevel =
			error.level === "high"
				? "error"
				: error.level === "medium"
					? "warn"
					: "info";

		this.log(level, error.message, {
			code: error.code,
			level: error.level,
			recoverable: error.recoverable,
			...error.context,
		});
	}
}

/**
 * Default logger instance
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create default logger
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
	if (!defaultLogger || config) {
		defaultLogger = new Logger(config);
	}
	return defaultLogger;
}

/**
 * Error handler manager
 */
export class ErrorManager {
	private logger: Logger;
	private handlers: Map<ErrorLevel, ErrorHandler[]> = new Map();
	private recoveryHandler?: RecoveryHandler;
	private fallbackQueue: Array<{ error: RalphError; data: unknown }> = [];

	constructor(logger?: Logger) {
		this.logger = logger ?? getLogger();
	}

	/**
	 * Register an error handler for a level
	 */
	onError(level: ErrorLevel, handler: ErrorHandler): void {
		const handlers = this.handlers.get(level) ?? [];
		handlers.push(handler);
		this.handlers.set(level, handlers);
	}

	/**
	 * Set recovery handler for high-level errors
	 */
	setRecoveryHandler(handler: RecoveryHandler): void {
		this.recoveryHandler = handler;
	}

	/**
	 * Handle an error
	 */
	async handle(error: RalphError): Promise<RecoveryChoice | null> {
		// Log the error
		this.logger.logError(error);

		// Call level-specific handlers
		const handlers = this.handlers.get(error.level) ?? [];
		for (const handler of handlers) {
			handler(error);
		}

		// For high-level errors, request recovery choice
		if (error.level === "high" && this.recoveryHandler) {
			const options = getRecoveryOptions(error);
			return this.recoveryHandler(error, options);
		}

		return null;
	}

	/**
	 * Add to fallback queue (for graceful degradation)
	 */
	queueForLater(error: RalphError, data: unknown): void {
		this.fallbackQueue.push({ error, data });
	}

	/**
	 * Get queued items
	 */
	getQueue(): Array<{ error: RalphError; data: unknown }> {
		return [...this.fallbackQueue];
	}

	/**
	 * Clear queue
	 */
	clearQueue(): void {
		this.fallbackQueue = [];
	}
}

/**
 * Try with fallback pattern
 */
export async function tryWithFallback<T>(
	primary: () => T | Promise<T>,
	fallback: FallbackFunction<T>,
	options: {
		errorLevel?: ErrorLevel;
		errorCode?: ErrorCode;
		logger?: Logger;
		onError?: (error: RalphError) => void;
	} = {},
): Promise<T> {
	const logger = options.logger ?? getLogger();

	try {
		return await primary();
	} catch (err) {
		const error = wrapError(err, options.errorLevel ?? "medium");
		error.code = options.errorCode ?? ErrorCodes.UNKNOWN_ERROR;

		logger.logError(error);
		options.onError?.(error);

		// Try fallback
		logger.info(`Attempting fallback for: ${error.message}`);
		return fallback();
	}
}

/**
 * Try with retry pattern
 */
export async function tryWithRetry<T>(
	operation: () => T | Promise<T>,
	options: {
		maxRetries?: number;
		delayMs?: number;
		backoff?: boolean;
		errorLevel?: ErrorLevel;
		logger?: Logger;
		onRetry?: (attempt: number, error: RalphError) => void;
	} = {},
): Promise<T> {
	const maxRetries = options.maxRetries ?? 3;
	const delayMs = options.delayMs ?? 1000;
	const backoff = options.backoff ?? true;
	const logger = options.logger ?? getLogger();

	let lastError: RalphError | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (err) {
			lastError = wrapError(err, options.errorLevel ?? "medium");

			if (attempt < maxRetries) {
				const delay = backoff ? delayMs * attempt : delayMs;
				logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`, {
					error: lastError.message,
				});
				options.onRetry?.(attempt, lastError);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	// All retries failed
	if (lastError) {
		lastError.level = "high";
		lastError.recoverable = false;
	}
	throw lastError ?? createError("All retries failed", { level: "high" });
}

/**
 * Graceful degradation wrapper
 */
export interface DegradationStrategy<T> {
	primary: () => T | Promise<T>;
	fallbacks: Array<{
		name: string;
		fn: FallbackFunction<T>;
	}>;
	defaultValue: T;
}

export async function withGracefulDegradation<T>(
	strategy: DegradationStrategy<T>,
	logger?: Logger,
): Promise<{ value: T; degraded: boolean; fallbackUsed?: string }> {
	const log = logger ?? getLogger();

	// Try primary
	try {
		const value = await strategy.primary();
		return { value, degraded: false };
	} catch (primaryError) {
		log.warn(`Primary operation failed: ${primaryError}`);
	}

	// Try fallbacks in order
	for (const fallback of strategy.fallbacks) {
		try {
			log.info(`Trying fallback: ${fallback.name}`);
			const value = await fallback.fn();
			return { value, degraded: true, fallbackUsed: fallback.name };
		} catch (fallbackError) {
			log.warn(`Fallback '${fallback.name}' failed: ${fallbackError}`);
		}
	}

	// All failed, return default
	log.warn("All strategies failed, using default value");
	return {
		value: strategy.defaultValue,
		degraded: true,
		fallbackUsed: "default",
	};
}

/**
 * Format error for user display
 */
export function formatErrorForUser(error: RalphError): string {
	const icon =
		error.level === "high" ? "❌" : error.level === "medium" ? "⚠️" : "ℹ️";
	const lines: string[] = [];

	lines.push(`${icon} ${error.message}`);

	if (error.context) {
		const contextStr = Object.entries(error.context)
			.map(([k, v]) => `  ${k}: ${v}`)
			.join("\n");
		if (contextStr) {
			lines.push(contextStr);
		}
	}

	return lines.join("\n");
}

/**
 * Format recovery options for user display
 */
export function formatRecoveryOptions(options: RecoveryOption[]): string {
	const lines: string[] = [];
	lines.push("\n선택:");

	options.forEach((opt, index) => {
		const desc = opt.description ? ` - ${opt.description}` : "";
		lines.push(`  [${index + 1}] ${opt.label}${desc}`);
	});

	return lines.join("\n");
}
