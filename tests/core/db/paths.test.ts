import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getGlobalConfigDir,
  getGlobalDBPath,
  getProjectDataDir,
  getProjectDBPath,
  getSnapshotsDir,
  getBackupsDir,
  ensureDir,
  ensureProjectDirs,
} from "../../../src/core/db/paths";

describe("DB Paths", () => {
  describe("Global paths", () => {
    it("should return global config dir in home", () => {
      const dir = getGlobalConfigDir();
      expect(dir).toContain(".config");
      expect(dir).toContain("ralph-mem");
    });

    it("should return global DB path", () => {
      const path = getGlobalDBPath();
      expect(path).toContain("ralph-mem");
      expect(path.endsWith("global.db")).toBe(true);
    });
  });

  describe("Project paths", () => {
    it("should return project data dir", () => {
      const dir = getProjectDataDir("/my/project");
      expect(dir).toBe("/my/project/.ralph-mem");
    });

    it("should return project DB path", () => {
      const path = getProjectDBPath("/my/project");
      expect(path).toBe("/my/project/.ralph-mem/memory.db");
    });

    it("should return snapshots dir", () => {
      const dir = getSnapshotsDir("/my/project");
      expect(dir).toBe("/my/project/.ralph-mem/snapshots");
    });

    it("should return backups dir", () => {
      const dir = getBackupsDir("/my/project");
      expect(dir).toBe("/my/project/.ralph-mem/backups");
    });

    it("should resolve relative paths", () => {
      const dir = getProjectDataDir("./relative");
      expect(dir).not.toContain("./");
      expect(dir).toContain("relative");
    });
  });

  describe("ensureDir", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "ralph-mem-test-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("should create directory if not exists", () => {
      const newDir = join(tempDir, "new", "nested", "dir");
      expect(existsSync(newDir)).toBe(false);

      ensureDir(newDir);

      expect(existsSync(newDir)).toBe(true);
    });

    it("should not throw if directory exists", () => {
      expect(() => ensureDir(tempDir)).not.toThrow();
    });
  });

  describe("ensureProjectDirs", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "ralph-mem-test-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("should create all project directories", () => {
      const dirs = ensureProjectDirs(tempDir);

      expect(existsSync(dirs.dataDir)).toBe(true);
      expect(existsSync(dirs.snapshotsDir)).toBe(true);
      expect(existsSync(dirs.backupsDir)).toBe(true);

      expect(dirs.dataDir).toBe(join(tempDir, ".ralph-mem"));
      expect(dirs.snapshotsDir).toBe(join(tempDir, ".ralph-mem", "snapshots"));
      expect(dirs.backupsDir).toBe(join(tempDir, ".ralph-mem", "backups"));
    });
  });
});
