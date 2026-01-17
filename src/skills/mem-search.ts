/**
 * /mem-search Skill
 *
 * Search memory with progressive disclosure:
 * - Layer 1: Index only (ID + score)
 * - Layer 2: Timeline context
 * - Layer 3: Full details
 *
 * See: docs/design/core-layer.md
 */

export interface MemSearchInput {
  query: string;
  layer?: 1 | 2 | 3;
  limit?: number;
  since?: string;
}

export interface MemSearchOutput {
  results: Array<{
    id: string;
    score: number;
    summary?: string;
    content?: string;
    createdAt?: string;
  }>;
  totalCount: number;
  layer: number;
}

export async function memSearchSkill(
  _input: MemSearchInput
): Promise<MemSearchOutput> {
  // TODO: Implement in Issue #012
  return {
    results: [],
    totalCount: 0,
    layer: 1,
  };
}
