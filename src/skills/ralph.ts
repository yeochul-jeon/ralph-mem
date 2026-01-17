/**
 * /ralph Skill
 *
 * Ralph Loop control commands:
 * - /ralph start <task> - Start a loop
 * - /ralph stop - Stop current loop
 * - /ralph status - Show loop status
 *
 * See: docs/design/ralph-loop.md
 */

export interface RalphSkillInput {
  command: "start" | "stop" | "status" | "config";
  task?: string;
  criteria?: string;
}

export interface RalphSkillOutput {
  success: boolean;
  message: string;
  loopId?: string;
  status?: {
    iteration: number;
    maxIterations: number;
    criteria: string;
    running: boolean;
  };
}

export async function ralphSkill(
  _input: RalphSkillInput
): Promise<RalphSkillOutput> {
  // TODO: Implement in Issues #017, #018, #019
  return {
    success: false,
    message: "Not implemented - see Issue #017",
  };
}
