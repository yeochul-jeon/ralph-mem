/**
 * Database Path Management
 *
 * Utilities for managing global and project database paths.
 * See: docs/design/storage-schema.md
 */

import { homedir } from "os";
import { join, resolve } from "path";
import { mkdirSync, existsSync } from "fs";

/**
 * Global config directory: ~/.config/ralph-mem/
 */
export function getGlobalConfigDir(): string {
  const configDir = join(homedir(), ".config", "ralph-mem");
  return configDir;
}

/**
 * Global database path: ~/.config/ralph-mem/global.db
 */
export function getGlobalDBPath(): string {
  return join(getGlobalConfigDir(), "global.db");
}

/**
 * Project data directory: <projectPath>/.ralph-mem/
 */
export function getProjectDataDir(projectPath: string): string {
  return join(resolve(projectPath), ".ralph-mem");
}

/**
 * Project database path: <projectPath>/.ralph-mem/memory.db
 */
export function getProjectDBPath(projectPath: string): string {
  return join(getProjectDataDir(projectPath), "memory.db");
}

/**
 * Project snapshots directory: <projectPath>/.ralph-mem/snapshots/
 */
export function getSnapshotsDir(projectPath: string): string {
  return join(getProjectDataDir(projectPath), "snapshots");
}

/**
 * Project backups directory: <projectPath>/.ralph-mem/backups/
 */
export function getBackupsDir(projectPath: string): string {
  return join(getProjectDataDir(projectPath), "backups");
}

/**
 * Ensure directory exists, create if not
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure global config directory exists
 */
export function ensureGlobalConfigDir(): string {
  const dir = getGlobalConfigDir();
  ensureDir(dir);
  return dir;
}

/**
 * Ensure project data directory exists
 */
export function ensureProjectDataDir(projectPath: string): string {
  const dir = getProjectDataDir(projectPath);
  ensureDir(dir);
  return dir;
}

/**
 * Ensure all project directories exist (data, snapshots, backups)
 */
export function ensureProjectDirs(projectPath: string): {
  dataDir: string;
  snapshotsDir: string;
  backupsDir: string;
} {
  const dataDir = getProjectDataDir(projectPath);
  const snapshotsDir = getSnapshotsDir(projectPath);
  const backupsDir = getBackupsDir(projectPath);

  ensureDir(dataDir);
  ensureDir(snapshotsDir);
  ensureDir(backupsDir);

  return { dataDir, snapshotsDir, backupsDir };
}
