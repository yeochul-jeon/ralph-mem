/**
 * Memory Store
 *
 * High-level memory management for sessions and observations.
 * See: docs/design/core-layer.md
 */

export interface Session {
  id: string;
  projectPath: string;
  startedAt: Date;
  endedAt?: Date;
  summary?: string;
  tokenCount: number;
}

export interface Observation {
  id: string;
  sessionId: string;
  type: "tool_use" | "bash" | "error" | "success" | "note";
  toolName?: string;
  content: string;
  contentCompressed?: string;
  importance: number;
  createdAt: Date;
}

export interface CreateObservation {
  sessionId: string;
  type: Observation["type"];
  toolName?: string;
  content: string;
  importance?: number;
}

export interface MemoryStore {
  // Session management
  createSession(projectPath: string): Promise<Session>;
  getCurrentSession(): Session | null;
  endSession(summary?: string): Promise<void>;

  // Observation management
  addObservation(obs: CreateObservation): Promise<Observation>;
  getObservation(id: string): Promise<Observation | null>;
  getRecentObservations(limit: number): Promise<Observation[]>;

  // Cleanup
  summarizeAndDelete(before: Date): Promise<number>;

  // Stats
  getTokenCount(): number;
}

// Placeholder implementation - to be completed in Issue #006
export function createMemoryStore(): MemoryStore {
  throw new Error("Not implemented - see Issue #006");
}
