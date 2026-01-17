/**
 * UserPromptSubmit Hook
 *
 * Triggered when user submits a prompt.
 * Searches memory and injects relevant context.
 *
 * See: docs/design/hook-layer.md
 */

export interface UserPromptSubmitContext {
  prompt: string;
  sessionId: string;
  projectPath: string;
}

export interface UserPromptSubmitResult {
  injectedContext?: string;
  tokenCount?: number;
}

export async function userPromptSubmitHook(
  _context: UserPromptSubmitContext
): Promise<UserPromptSubmitResult> {
  // TODO: Implement in Issue #011
  return {};
}
