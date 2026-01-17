import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDBClient,
  generateSessionId,
  generateObservationId,
  generateLoopId,
  type DBClient,
} from "../../../src/core/db/client";

describe("DBClient", () => {
  let client: DBClient;

  beforeEach(() => {
    client = createDBClient(":memory:");
  });

  afterEach(() => {
    client.close();
  });

  describe("ID generation", () => {
    it("should generate session IDs with prefix", () => {
      const id = generateSessionId();
      expect(id).toMatch(/^sess-[a-zA-Z0-9_-]+$/);
    });

    it("should generate observation IDs with prefix", () => {
      const id = generateObservationId();
      expect(id).toMatch(/^obs-[a-zA-Z0-9_-]+$/);
    });

    it("should generate loop IDs with prefix", () => {
      const id = generateLoopId();
      expect(id).toMatch(/^loop-[a-zA-Z0-9_-]+$/);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("Session CRUD", () => {
    it("should create and get a session", () => {
      const session = client.createSession({ project_path: "/test/project" });

      expect(session.id).toMatch(/^sess-/);
      expect(session.project_path).toBe("/test/project");
      expect(session.started_at).toBeDefined();
      expect(session.ended_at).toBeNull();
      expect(session.token_count).toBe(0);

      const retrieved = client.getSession(session.id);
      expect(retrieved).toEqual(session);
    });

    it("should return null for non-existent session", () => {
      const session = client.getSession("sess-nonexistent");
      expect(session).toBeNull();
    });

    it("should update a session", () => {
      const session = client.createSession({ project_path: "/test/project" });

      client.updateSession(session.id, {
        summary: "Test summary",
        token_count: 100,
      });

      const updated = client.getSession(session.id);
      expect(updated?.summary).toBe("Test summary");
      expect(updated?.token_count).toBe(100);
    });

    it("should end a session", () => {
      const session = client.createSession({ project_path: "/test/project" });

      client.endSession(session.id, "Completed successfully");

      const ended = client.getSession(session.id);
      expect(ended?.ended_at).toBeDefined();
      expect(ended?.summary).toBe("Completed successfully");
    });

    it("should list sessions for a project", () => {
      client.createSession({ project_path: "/project/a" });
      client.createSession({ project_path: "/project/a" });
      client.createSession({ project_path: "/project/b" });

      const sessionsA = client.listSessions("/project/a");
      const sessionsB = client.listSessions("/project/b");

      expect(sessionsA.length).toBe(2);
      expect(sessionsB.length).toBe(1);
    });

    it("should limit session list", () => {
      for (let i = 0; i < 10; i++) {
        client.createSession({ project_path: "/test" });
      }

      const sessions = client.listSessions("/test", 5);
      expect(sessions.length).toBe(5);
    });
  });

  describe("Observation CRUD", () => {
    let sessionId: string;

    beforeEach(() => {
      const session = client.createSession({ project_path: "/test" });
      sessionId = session.id;
    });

    it("should create and get an observation", () => {
      const obs = client.createObservation({
        session_id: sessionId,
        type: "note",
        content: "Test observation",
      });

      expect(obs.id).toMatch(/^obs-/);
      expect(obs.session_id).toBe(sessionId);
      expect(obs.type).toBe("note");
      expect(obs.content).toBe("Test observation");
      expect(obs.importance).toBe(0.5);

      const retrieved = client.getObservation(obs.id);
      expect(retrieved).toEqual(obs);
    });

    it("should create observation with tool_name", () => {
      const obs = client.createObservation({
        session_id: sessionId,
        type: "tool_use",
        tool_name: "Read",
        content: "Read file content",
      });

      expect(obs.tool_name).toBe("Read");
    });

    it("should create observation with custom importance", () => {
      const obs = client.createObservation({
        session_id: sessionId,
        type: "error",
        content: "Error occurred",
        importance: 0.9,
      });

      expect(obs.importance).toBe(0.9);
    });

    it("should return null for non-existent observation", () => {
      const obs = client.getObservation("obs-nonexistent");
      expect(obs).toBeNull();
    });

    it("should list observations for a session", () => {
      client.createObservation({
        session_id: sessionId,
        type: "note",
        content: "First",
      });
      client.createObservation({
        session_id: sessionId,
        type: "note",
        content: "Second",
      });

      const observations = client.listObservations(sessionId);
      expect(observations.length).toBe(2);
    });

    it("should delete an observation", () => {
      const obs = client.createObservation({
        session_id: sessionId,
        type: "note",
        content: "To be deleted",
      });

      client.deleteObservation(obs.id);

      const deleted = client.getObservation(obs.id);
      expect(deleted).toBeNull();
    });
  });

  describe("LoopRun CRUD", () => {
    let sessionId: string;

    beforeEach(() => {
      const session = client.createSession({ project_path: "/test" });
      sessionId = session.id;
    });

    it("should create and get a loop run", () => {
      const loop = client.createLoopRun({
        session_id: sessionId,
        task: "Fix all tests",
        criteria: JSON.stringify({ type: "test_pass" }),
      });

      expect(loop.id).toMatch(/^loop-/);
      expect(loop.session_id).toBe(sessionId);
      expect(loop.task).toBe("Fix all tests");
      expect(loop.status).toBe("running");
      expect(loop.iterations).toBe(0);
      expect(loop.max_iterations).toBe(10);

      const retrieved = client.getLoopRun(loop.id);
      expect(retrieved).toEqual(loop);
    });

    it("should create loop with custom max_iterations", () => {
      const loop = client.createLoopRun({
        session_id: sessionId,
        task: "Task",
        criteria: "{}",
        max_iterations: 5,
      });

      expect(loop.max_iterations).toBe(5);
    });

    it("should return null for non-existent loop", () => {
      const loop = client.getLoopRun("loop-nonexistent");
      expect(loop).toBeNull();
    });

    it("should update a loop run", () => {
      const loop = client.createLoopRun({
        session_id: sessionId,
        task: "Task",
        criteria: "{}",
      });

      client.updateLoopRun(loop.id, {
        status: "success",
        iterations: 3,
        ended_at: new Date().toISOString(),
      });

      const updated = client.getLoopRun(loop.id);
      expect(updated?.status).toBe("success");
      expect(updated?.iterations).toBe(3);
      expect(updated?.ended_at).toBeDefined();
    });

    it("should get active loop run", () => {
      client.createLoopRun({
        session_id: sessionId,
        task: "Completed task",
        criteria: "{}",
      });
      // Complete the first one
      const loops = client.db.prepare(
        "SELECT id FROM loop_runs WHERE session_id = ?"
      ).all(sessionId) as { id: string }[];
      client.updateLoopRun(loops[0].id, { status: "success" });

      // Create a new running loop
      const activeLoop = client.createLoopRun({
        session_id: sessionId,
        task: "Current task",
        criteria: "{}",
      });

      const found = client.getActiveLoopRun(sessionId);
      expect(found?.id).toBe(activeLoop.id);
      expect(found?.task).toBe("Current task");
    });

    it("should return null when no active loop", () => {
      const loop = client.createLoopRun({
        session_id: sessionId,
        task: "Task",
        criteria: "{}",
      });
      client.updateLoopRun(loop.id, { status: "success" });

      const active = client.getActiveLoopRun(sessionId);
      expect(active).toBeNull();
    });
  });

  describe("Connection", () => {
    it("should close connection gracefully", () => {
      const testClient = createDBClient(":memory:");

      // Should not throw
      expect(() => testClient.close()).not.toThrow();
    });
  });
});
