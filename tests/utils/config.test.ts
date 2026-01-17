import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  DEFAULT_CONFIG,
  deepMerge,
  loadYamlConfig,
  loadConfig,
  getConfigSection,
  getGlobalConfigPath,
  getProjectConfigPath,
  type Config,
} from "../../src/utils/config";

describe("Config", () => {
  describe("DEFAULT_CONFIG", () => {
    it("should have all required sections", () => {
      expect(DEFAULT_CONFIG.ralph).toBeDefined();
      expect(DEFAULT_CONFIG.memory).toBeDefined();
      expect(DEFAULT_CONFIG.search).toBeDefined();
      expect(DEFAULT_CONFIG.privacy).toBeDefined();
      expect(DEFAULT_CONFIG.logging).toBeDefined();
    });

    it("should have reasonable ralph defaults", () => {
      expect(DEFAULT_CONFIG.ralph.max_iterations).toBe(10);
      expect(DEFAULT_CONFIG.ralph.context_budget).toBe(50000);
      expect(DEFAULT_CONFIG.ralph.cooldown_ms).toBe(1000);
      expect(DEFAULT_CONFIG.ralph.success_criteria).toHaveLength(1);
      expect(DEFAULT_CONFIG.ralph.success_criteria[0].type).toBe("test_pass");
    });

    it("should have reasonable memory defaults", () => {
      expect(DEFAULT_CONFIG.memory.auto_inject).toBe(true);
      expect(DEFAULT_CONFIG.memory.max_inject_tokens).toBe(2000);
      expect(DEFAULT_CONFIG.memory.retention_days).toBe(30);
    });

    it("should have reasonable search defaults", () => {
      expect(DEFAULT_CONFIG.search.fts_first).toBe(true);
      expect(DEFAULT_CONFIG.search.embedding_fallback).toBe(false);
      expect(DEFAULT_CONFIG.search.default_limit).toBe(10);
    });

    it("should have reasonable privacy defaults", () => {
      expect(DEFAULT_CONFIG.privacy.exclude_patterns).toContain("*.env");
      expect(DEFAULT_CONFIG.privacy.exclude_patterns).toContain("*secret*");
    });

    it("should have reasonable logging defaults", () => {
      expect(DEFAULT_CONFIG.logging.level).toBe("info");
      expect(DEFAULT_CONFIG.logging.file).toBe(false);
    });
  });

  describe("deepMerge", () => {
    it("should merge flat objects", () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("should deep merge nested objects", () => {
      const target = {
        ralph: { max_iterations: 10, cooldown_ms: 1000 },
        memory: { auto_inject: true },
      };
      const source = {
        ralph: { max_iterations: 5 },
      };

      const result = deepMerge(target, source as Partial<typeof target>);

      expect(result.ralph.max_iterations).toBe(5);
      expect(result.ralph.cooldown_ms).toBe(1000);
      expect(result.memory.auto_inject).toBe(true);
    });

    it("should replace arrays, not merge them", () => {
      const target = {
        privacy: { exclude_patterns: ["*.env", "*.key"] },
      };
      const source = {
        privacy: { exclude_patterns: ["*.secret"] },
      };

      const result = deepMerge(target, source as Partial<typeof target>);

      expect(result.privacy.exclude_patterns).toEqual(["*.secret"]);
    });

    it("should not modify original objects", () => {
      const target = { a: 1, nested: { b: 2 } };
      const source = { nested: { c: 3 } };
      const original = JSON.parse(JSON.stringify(target));

      deepMerge(target, source as Partial<typeof target>);

      expect(target).toEqual(original);
    });

    it("should handle undefined source values", () => {
      const target = { a: 1, b: 2 };
      const source = { a: undefined, c: 3 };

      const result = deepMerge(target, source as Partial<typeof target>);

      expect(result.a).toBe(1); // unchanged
      expect(result.c).toBe(3);
    });
  });

  describe("loadYamlConfig", () => {
    const testDir = join(tmpdir(), "ralph-mem-config-test");

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    it("should return empty object for non-existent file", () => {
      const result = loadYamlConfig(join(testDir, "nonexistent.yaml"));
      expect(result).toEqual({});
    });

    it("should return empty object for empty file", () => {
      const filePath = join(testDir, "empty.yaml");
      writeFileSync(filePath, "");

      const result = loadYamlConfig(filePath);
      expect(result).toEqual({});
    });

    it("should parse valid YAML", () => {
      const filePath = join(testDir, "valid.yaml");
      writeFileSync(
        filePath,
        `
ralph:
  max_iterations: 5
memory:
  auto_inject: false
`
      );

      const result = loadYamlConfig(filePath);

      expect(result.ralph?.max_iterations).toBe(5);
      expect(result.memory?.auto_inject).toBe(false);
    });

    it("should throw for invalid YAML", () => {
      const filePath = join(testDir, "invalid.yaml");
      writeFileSync(filePath, "[ invalid yaml {");

      expect(() => loadYamlConfig(filePath)).toThrow();
    });

    it("should throw for non-object YAML", () => {
      const filePath = join(testDir, "array.yaml");
      writeFileSync(filePath, "- item1\n- item2");

      expect(() => loadYamlConfig(filePath)).toThrow(/expected object/);
    });
  });

  describe("Config paths", () => {
    it("should return global config path", () => {
      const path = getGlobalConfigPath();
      expect(path.endsWith("config.yaml")).toBe(true);
      expect(path).toContain("ralph-mem");
    });

    it("should return project config path", () => {
      const path = getProjectConfigPath("/my/project");
      expect(path.endsWith("config.yaml")).toBe(true);
      expect(path).toContain(".ralph-mem");
    });
  });

  describe("loadConfig", () => {
    it("should return defaults when no config files exist", () => {
      // Using a non-existent project path
      const config = loadConfig("/nonexistent/project/path");

      expect(config.ralph.max_iterations).toBe(
        DEFAULT_CONFIG.ralph.max_iterations
      );
      expect(config.memory.auto_inject).toBe(DEFAULT_CONFIG.memory.auto_inject);
    });

    it("should return defaults without project path", () => {
      const config = loadConfig();

      expect(config.ralph).toBeDefined();
      expect(config.memory).toBeDefined();
      expect(config.search).toBeDefined();
    });
  });

  describe("getConfigSection", () => {
    it("should return specific section", () => {
      const ralph = getConfigSection("ralph");

      expect(ralph.max_iterations).toBeDefined();
      expect(ralph.context_budget).toBeDefined();
    });

    it("should return memory section", () => {
      const memory = getConfigSection("memory");

      expect(memory.auto_inject).toBeDefined();
      expect(memory.max_inject_tokens).toBeDefined();
    });
  });

  describe("Config merge priority", () => {
    const testDir = join(tmpdir(), "ralph-mem-merge-test");
    const globalDir = join(testDir, "global");
    const projectDir = join(testDir, "project", ".ralph-mem");

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
      mkdirSync(globalDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    it("should deep merge nested config values", () => {
      // Test that deep merge works correctly for partial configs
      const config: Partial<Config> = {
        ralph: {
          max_iterations: 20,
          context_budget: DEFAULT_CONFIG.ralph.context_budget,
          cooldown_ms: DEFAULT_CONFIG.ralph.cooldown_ms,
          success_criteria: DEFAULT_CONFIG.ralph.success_criteria,
        },
      };

      const result = deepMerge(DEFAULT_CONFIG, config);

      expect(result.ralph.max_iterations).toBe(20);
      expect(result.ralph.context_budget).toBe(
        DEFAULT_CONFIG.ralph.context_budget
      );
      expect(result.memory).toEqual(DEFAULT_CONFIG.memory);
    });
  });
});
