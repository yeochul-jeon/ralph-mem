/**
 * SessionStart Hook
 *
 * Triggered when a new Claude Code session starts.
 * Injects relevant memory context from previous sessions.
 *
 * See: docs/design/hook-layer.md
 */

export interface SessionStartContext {
  projectPath: string;
  sessionId: string;
}

export interface SessionStartResult {
  injectedContext?: string;
  tokenCount?: number;
}

export async function sessionStartHook(
  _context: SessionStartContext
): Promise<SessionStartResult> {
  // TODO: Implement in Issue #008
  return {};
}
