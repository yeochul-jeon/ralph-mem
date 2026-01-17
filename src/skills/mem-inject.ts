/**
 * /mem-inject Skill
 *
 * Manually inject context into memory.
 * Useful for adding project-specific knowledge.
 *
 * See: docs/design/core-layer.md
 */

export interface MemInjectInput {
  content: string;
  type?: "note" | "context";
  importance?: number;
}

export interface MemInjectOutput {
  success: boolean;
  observationId?: string;
  message: string;
}

export async function memInjectSkill(
  _input: MemInjectInput
): Promise<MemInjectOutput> {
  // TODO: Implement in Issue #025
  return {
    success: false,
    message: "Not implemented - see Issue #025",
  };
}
