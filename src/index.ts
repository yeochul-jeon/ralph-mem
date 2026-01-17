/**
 * ralph-mem: Persistent context management plugin for Claude Code
 *
 * Combines claude-mem's intelligent context management with Ralph Loop's
 * "succeed until done" philosophy.
 */

export const VERSION = "0.1.0";

// Core Layer exports
export * from "./core/store";
export * from "./core/search";

// Plugin entry point (to be implemented)
export async function activate(): Promise<void> {
  console.log(`ralph-mem v${VERSION} activated`);
}

export async function deactivate(): Promise<void> {
  console.log("ralph-mem deactivated");
}
