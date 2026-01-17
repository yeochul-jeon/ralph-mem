/**
 * SessionEnd Hook
 *
 * Triggered when a Claude Code session ends.
 * Generates and stores session summary.
 *
 * See: docs/design/hook-layer.md
 */

export interface SessionEndContext {
  sessionId: string;
  projectPath: string;
}

export interface SessionEndResult {
  summary?: string;
  observationCount?: number;
}

export async function sessionEndHook(
  _context: SessionEndContext
): Promise<SessionEndResult> {
  // TODO: Implement in Issue #009
  return {};
}
