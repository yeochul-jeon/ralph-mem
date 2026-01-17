import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type DegradationStrategy,
	ErrorCodes,
	type ErrorLevel,
	ErrorManager,
	type FallbackFunction,
	Logger,
	type LoggerConfig,
	type RalphError,
	type RecoveryChoice,
	type RecoveryOption,
	createError,
	formatErrorForUser,
	formatRecoveryOptions,
	getLogger,
	getRecoveryOptions,
	isRalphError,
	tryWithFallback,
	tryWithRetry,
	withGracefulDegradation,
	wrapError,
} from "../../src/utils/errors";

describe("Error Handling", () => {
	describe("createError", () => {
		it("should create error with defaults", () => {
			const error = createError("Test error");

			expect(error.message).toBe("Test error");
			expect(error.level).toBe("medium");
			expect(error.recoverable).toBe(true);
			expect(error.code).toBe(ErrorCodes.UNKNOWN_ERROR);
			expect(error.timestamp).toBeInstanceOf(Date);
		});

		it("should create error with custom options", () => {
			const error = createError("DB failed", {
				level: "high",
				recoverable: false,
				code: ErrorCodes.DB_CONNECTION_FAILED,
				context: { host: "localhost" },
			});

			expect(error.level).toBe("high");
			expect(error.recoverable).toBe(false);
			expect(error.code).toBe(ErrorCodes.DB_CONNECTION_FAILED);
			expect(error.context?.host).toBe("localhost");
		});

		it("should preserve cause error", () => {
			const cause = new Error("Original error");
			const error = createError("Wrapped error", { cause });

			expect(error.cause).toBe(cause);
		});
	});

	describe("isRalphError", () => {
		it("should return true for RalphError", () => {
			const error = createError("Test");

			expect(isRalphError(error)).toBe(true);
		});

		it("should return false for regular Error", () => {
			const error = new Error("Test");

			expect(isRalphError(error)).toBe(false);
		});

		it("should return false for non-error", () => {
			expect(isRalphError("string")).toBe(false);
			expect(isRalphError(null)).toBe(false);
			expect(isRalphError(undefined)).toBe(false);
		});
	});

	describe("wrapError", () => {
		it("should return RalphError unchanged", () => {
			const original = createError("Test", { level: "high" });
			const wrapped = wrapError(original);

			expect(wrapped).toBe(original);
			expect(wrapped.level).toBe("high");
		});

		it("should wrap regular Error", () => {
			const original = new Error("Regular error");
			const wrapped = wrapError(original, "low");

			expect(wrapped.message).toBe("Regular error");
			expect(wrapped.level).toBe("low");
			expect(wrapped.cause).toBe(original);
		});

		it("should wrap string", () => {
			const wrapped = wrapError("String error");

			expect(wrapped.message).toBe("String error");
			expect(wrapped.level).toBe("medium");
		});
	});

	describe("getRecoveryOptions", () => {
		it("should return options for known error code", () => {
			const error = createError("DB failed", {
				code: ErrorCodes.DB_CONNECTION_FAILED,
			});
			const options = getRecoveryOptions(error);

			expect(options.length).toBeGreaterThan(0);
			expect(options.some((o) => o.id === "retry")).toBe(true);
		});

		it("should return default options for unknown code", () => {
			const error = createError("Unknown");
			const options = getRecoveryOptions(error);

			expect(options.length).toBeGreaterThan(0);
		});
	});
});

describe("Logger", () => {
	let testDir: string;
	let consoleSpy: {
		log: MockInstance;
		warn: MockInstance;
		error: MockInstance;
	};

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-logger-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		consoleSpy = {
			log: vi.spyOn(console, "log").mockImplementation(() => {}),
			warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
			error: vi.spyOn(console, "error").mockImplementation(() => {}),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	it("should log at appropriate level", () => {
		const logger = new Logger({ level: "info" });

		logger.debug("Debug message");
		logger.info("Info message");
		logger.warn("Warn message");
		logger.error("Error message");

		// Debug should be skipped (level is info)
		expect(consoleSpy.log).toHaveBeenCalledTimes(1);
		expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
		expect(consoleSpy.error).toHaveBeenCalledTimes(1);
	});

	it("should log debug when level is debug", () => {
		const logger = new Logger({ level: "debug" });

		logger.debug("Debug message");
		logger.info("Info message");

		expect(consoleSpy.log).toHaveBeenCalledTimes(2);
	});

	it("should only log error when level is error", () => {
		const logger = new Logger({ level: "error" });

		logger.debug("Debug");
		logger.info("Info");
		logger.warn("Warn");
		logger.error("Error");

		expect(consoleSpy.log).not.toHaveBeenCalled();
		expect(consoleSpy.warn).not.toHaveBeenCalled();
		expect(consoleSpy.error).toHaveBeenCalledTimes(1);
	});

	it("should include context in message", () => {
		const logger = new Logger({ level: "info" });

		logger.info("Test", { key: "value" });

		expect(consoleSpy.log).toHaveBeenCalledWith(
			expect.stringContaining('"key":"value"'),
		);
	});

	it("should write to file when enabled", () => {
		const logPath = join(testDir, "test.log");
		const logger = new Logger({
			level: "info",
			file: true,
			filePath: logPath,
		});

		logger.info("Test message");

		expect(existsSync(logPath)).toBe(true);
		const content = readFileSync(logPath, "utf-8");
		expect(content).toContain("Test message");
		expect(content).toContain("[INFO]");
	});

	it("should create log directory if not exists", () => {
		const logPath = join(testDir, "subdir", "nested", "test.log");
		const logger = new Logger({
			level: "info",
			file: true,
			filePath: logPath,
		});

		logger.info("Test");

		expect(existsSync(logPath)).toBe(true);
	});

	it("should log RalphError appropriately", () => {
		const logger = new Logger({ level: "info" });

		const lowError = createError("Low error", { level: "low" });
		const mediumError = createError("Medium error", { level: "medium" });
		const highError = createError("High error", { level: "high" });

		logger.logError(lowError);
		logger.logError(mediumError);
		logger.logError(highError);

		// Low -> info, Medium -> warn, High -> error
		expect(consoleSpy.log).toHaveBeenCalledTimes(1);
		expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
		expect(consoleSpy.error).toHaveBeenCalledTimes(1);
	});
});

describe("ErrorManager", () => {
	let consoleSpy: {
		log: MockInstance;
		warn: MockInstance;
		error: MockInstance;
	};

	beforeEach(() => {
		consoleSpy = {
			log: vi.spyOn(console, "log").mockImplementation(() => {}),
			warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
			error: vi.spyOn(console, "error").mockImplementation(() => {}),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should call level-specific handlers", async () => {
		const manager = new ErrorManager();
		const lowHandler = vi.fn();
		const highHandler = vi.fn();

		manager.onError("low", lowHandler);
		manager.onError("high", highHandler);

		const lowError = createError("Low", { level: "low" });
		const highError = createError("High", { level: "high" });

		await manager.handle(lowError);
		await manager.handle(highError);

		expect(lowHandler).toHaveBeenCalledWith(lowError);
		expect(highHandler).toHaveBeenCalledWith(highError);
	});

	it("should call recovery handler for high errors", async () => {
		const manager = new ErrorManager();
		const recoveryHandler = vi.fn().mockResolvedValue({
			optionId: "retry",
			error: {} as RalphError,
		});

		manager.setRecoveryHandler(recoveryHandler);

		const error = createError("Critical", {
			level: "high",
			code: ErrorCodes.DB_CONNECTION_FAILED,
		});
		await manager.handle(error);

		expect(recoveryHandler).toHaveBeenCalled();
		expect(recoveryHandler).toHaveBeenCalledWith(
			error,
			expect.arrayContaining([expect.objectContaining({ id: "retry" })]),
		);
	});

	it("should not call recovery handler for low/medium errors", async () => {
		const manager = new ErrorManager();
		const recoveryHandler = vi.fn();

		manager.setRecoveryHandler(recoveryHandler);

		await manager.handle(createError("Low", { level: "low" }));
		await manager.handle(createError("Medium", { level: "medium" }));

		expect(recoveryHandler).not.toHaveBeenCalled();
	});

	it("should manage fallback queue", () => {
		const manager = new ErrorManager();
		const error = createError("Queue test");
		const data = { test: "data" };

		manager.queueForLater(error, data);
		const queue = manager.getQueue();

		expect(queue.length).toBe(1);
		expect(queue[0].error).toBe(error);
		expect(queue[0].data).toEqual(data);

		manager.clearQueue();
		expect(manager.getQueue().length).toBe(0);
	});
});

describe("tryWithFallback", () => {
	let consoleSpy: {
		log: MockInstance;
		warn: MockInstance;
		error: MockInstance;
	};

	beforeEach(() => {
		consoleSpy = {
			log: vi.spyOn(console, "log").mockImplementation(() => {}),
			warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
			error: vi.spyOn(console, "error").mockImplementation(() => {}),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return primary result on success", async () => {
		const result = await tryWithFallback(
			() => "primary",
			() => "fallback",
		);

		expect(result).toBe("primary");
	});

	it("should return fallback on primary failure", async () => {
		const result = await tryWithFallback(
			() => {
				throw new Error("Primary failed");
			},
			() => "fallback",
		);

		expect(result).toBe("fallback");
	});

	it("should call onError callback", async () => {
		const onError = vi.fn();

		await tryWithFallback(
			() => {
				throw new Error("Failed");
			},
			() => "fallback",
			{ onError },
		);

		expect(onError).toHaveBeenCalled();
	});

	it("should work with async functions", async () => {
		const result = await tryWithFallback(
			async () => {
				throw new Error("Async failed");
			},
			async () => "async fallback",
		);

		expect(result).toBe("async fallback");
	});
});

describe("tryWithRetry", () => {
	let consoleSpy: {
		log: MockInstance;
		warn: MockInstance;
		error: MockInstance;
	};

	beforeEach(() => {
		consoleSpy = {
			log: vi.spyOn(console, "log").mockImplementation(() => {}),
			warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
			error: vi.spyOn(console, "error").mockImplementation(() => {}),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should succeed on first try", async () => {
		let attempts = 0;
		const result = await tryWithRetry(() => {
			attempts++;
			return "success";
		});

		expect(result).toBe("success");
		expect(attempts).toBe(1);
	});

	it("should retry on failure", async () => {
		let attempts = 0;
		const result = await tryWithRetry(
			() => {
				attempts++;
				if (attempts < 3) {
					throw new Error("Not yet");
				}
				return "success";
			},
			{ maxRetries: 3, delayMs: 10 },
		);

		expect(result).toBe("success");
		expect(attempts).toBe(3);
	});

	it("should throw after max retries", async () => {
		let attempts = 0;

		await expect(
			tryWithRetry(
				() => {
					attempts++;
					throw new Error("Always fails");
				},
				{ maxRetries: 2, delayMs: 10 },
			),
		).rejects.toThrow();

		expect(attempts).toBe(2);
	});

	it("should call onRetry callback", async () => {
		const onRetry = vi.fn();
		let attempts = 0;

		await tryWithRetry(
			() => {
				attempts++;
				if (attempts < 2) throw new Error("Retry");
				return "ok";
			},
			{ maxRetries: 3, delayMs: 10, onRetry },
		);

		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(onRetry).toHaveBeenCalledWith(1, expect.any(Object));
	});
});

describe("withGracefulDegradation", () => {
	let consoleSpy: {
		log: MockInstance;
		warn: MockInstance;
		error: MockInstance;
	};

	beforeEach(() => {
		consoleSpy = {
			log: vi.spyOn(console, "log").mockImplementation(() => {}),
			warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
			error: vi.spyOn(console, "error").mockImplementation(() => {}),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should use primary when successful", async () => {
		const strategy: DegradationStrategy<string> = {
			primary: () => "primary result",
			fallbacks: [{ name: "fallback1", fn: () => "fallback1 result" }],
			defaultValue: "default",
		};

		const result = await withGracefulDegradation(strategy);

		expect(result.value).toBe("primary result");
		expect(result.degraded).toBe(false);
		expect(result.fallbackUsed).toBeUndefined();
	});

	it("should use first fallback when primary fails", async () => {
		const strategy: DegradationStrategy<string> = {
			primary: () => {
				throw new Error("Primary failed");
			},
			fallbacks: [
				{ name: "fallback1", fn: () => "fallback1 result" },
				{ name: "fallback2", fn: () => "fallback2 result" },
			],
			defaultValue: "default",
		};

		const result = await withGracefulDegradation(strategy);

		expect(result.value).toBe("fallback1 result");
		expect(result.degraded).toBe(true);
		expect(result.fallbackUsed).toBe("fallback1");
	});

	it("should use second fallback when first fails", async () => {
		const strategy: DegradationStrategy<string> = {
			primary: () => {
				throw new Error("Primary failed");
			},
			fallbacks: [
				{
					name: "fallback1",
					fn: () => {
						throw new Error("Fallback1 failed");
					},
				},
				{ name: "fallback2", fn: () => "fallback2 result" },
			],
			defaultValue: "default",
		};

		const result = await withGracefulDegradation(strategy);

		expect(result.value).toBe("fallback2 result");
		expect(result.degraded).toBe(true);
		expect(result.fallbackUsed).toBe("fallback2");
	});

	it("should use default when all fail", async () => {
		const strategy: DegradationStrategy<string> = {
			primary: () => {
				throw new Error("Primary failed");
			},
			fallbacks: [
				{
					name: "fallback1",
					fn: () => {
						throw new Error("Fallback1 failed");
					},
				},
			],
			defaultValue: "default",
		};

		const result = await withGracefulDegradation(strategy);

		expect(result.value).toBe("default");
		expect(result.degraded).toBe(true);
		expect(result.fallbackUsed).toBe("default");
	});
});

describe("formatErrorForUser", () => {
	it("should format high error with X icon", () => {
		const error = createError("Critical failure", { level: "high" });
		const formatted = formatErrorForUser(error);

		expect(formatted).toContain("❌");
		expect(formatted).toContain("Critical failure");
	});

	it("should format medium error with warning icon", () => {
		const error = createError("Warning", { level: "medium" });
		const formatted = formatErrorForUser(error);

		expect(formatted).toContain("⚠️");
	});

	it("should format low error with info icon", () => {
		const error = createError("Info", { level: "low" });
		const formatted = formatErrorForUser(error);

		expect(formatted).toContain("ℹ️");
	});

	it("should include context", () => {
		const error = createError("Error with context", {
			context: { host: "localhost", port: 5432 },
		});
		const formatted = formatErrorForUser(error);

		expect(formatted).toContain("host: localhost");
		expect(formatted).toContain("port: 5432");
	});
});

describe("formatRecoveryOptions", () => {
	it("should format options with numbers", () => {
		const options: RecoveryOption[] = [
			{ id: "retry", label: "재시도" },
			{ id: "abort", label: "중단" },
		];
		const formatted = formatRecoveryOptions(options);

		expect(formatted).toContain("[1] 재시도");
		expect(formatted).toContain("[2] 중단");
	});

	it("should include descriptions", () => {
		const options: RecoveryOption[] = [
			{ id: "retry", label: "재시도", description: "연결을 다시 시도합니다" },
		];
		const formatted = formatRecoveryOptions(options);

		expect(formatted).toContain("재시도 - 연결을 다시 시도합니다");
	});
});

describe("Log file rotation", () => {
	let testDir: string;
	let consoleSpy: {
		log: MockInstance;
		warn: MockInstance;
		error: MockInstance;
	};

	beforeEach(() => {
		testDir = join(tmpdir(), `ralph-logger-rotation-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		consoleSpy = {
			log: vi.spyOn(console, "log").mockImplementation(() => {}),
			warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
			error: vi.spyOn(console, "error").mockImplementation(() => {}),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	it("should rotate when file exceeds max size", () => {
		const logPath = join(testDir, "rotate.log");

		// Create a small max size to trigger rotation
		const logger = new Logger({
			level: "info",
			file: true,
			filePath: logPath,
			maxFileSize: 100, // 100 bytes
		});

		// Write enough to exceed 100 bytes
		for (let i = 0; i < 10; i++) {
			logger.info(`Message ${i} with some extra content to fill the log`);
		}

		// Check that rotation happened
		expect(existsSync(logPath)).toBe(true);
		// Rotated file should exist
		const rotatedPath = `${logPath}.1`;
		expect(existsSync(rotatedPath)).toBe(true);
	});
});
