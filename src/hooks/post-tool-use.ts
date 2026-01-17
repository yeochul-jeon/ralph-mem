/**
 * PostToolUse Hook
 *
 * Triggered after a tool is used.
 * Records tool usage as an observation.
 *
 * See: docs/design/hook-layer.md
 */

export interface PostToolUseContext {
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
  sessionId: string;
  success: boolean;
}

export interface PostToolUseResult {
  observationId?: string;
  recorded?: boolean;
}

export async function postToolUseHook(
  _context: PostToolUseContext
): Promise<PostToolUseResult> {
  // TODO: Implement in Issue #010
  return {};
}
