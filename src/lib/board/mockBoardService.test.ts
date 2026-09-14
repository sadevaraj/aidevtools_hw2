import { describe, expect, it } from "vitest";
import { MockBoardService } from "./mockBoardService";
import { ValidationError } from "./types";

const svc = () => new MockBoardService({ latency: 0, persist: false });

describe("MockBoardService — projects", () => {
  it("creates projects with incrementing positions", async () => {
    const s = svc();
    const a = await s.createProject("Alpha");
    const b = await s.createProject("Beta");
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
    expect(s.getState().projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });

  it("rejects empty and over-long names", async () => {
    const s = svc();
    await expect(s.createProject("  ")).rejects.toBeInstanceOf(ValidationError);
    await expect(s.createProject("x".repeat(51))).rejects.toThrow(/too long/);
  });

  it("deletes a project with its tasks and supports undo", async () => {
    const s = svc();
    const p = await s.createProject("Alpha");
    await s.createTask({ project_id: p.id, title: "T1", assignee: "Dev" });
    await s.deleteProject(p.id);
    expect(s.getState().projects).toHaveLength(0);
    expect(s.getState().tasks).toHaveLength(0);
    await s.undoDeleteProject(p.id);
    expect(s.getState().projects).toHaveLength(1);
    expect(s.getState().tasks).toHaveLength(1);
  });

  it("reorders projects", async () => {
    const s = svc();
    const a = await s.createProject("Alpha");
    const b = await s.createProject("Beta");
    await s.reorderProjects([b.id, a.id]);
    expect(s.getState().projects.map((p) => p.name)).toEqual(["Beta", "Alpha"]);
  });

  it("hides and shows projects", async () => {
    const s = svc();
    const p = await s.createProject("Alpha");
    await s.setProjectHidden(p.id, true);
    expect(s.getState().projects[0]!.hidden).toBe(true);
  });
});

describe("MockBoardService — tasks", () => {
  it("creates tasks in To Do and validates fields", async () => {
    const s = svc();
    const p = await s.createProject("Alpha");
    const t = await s.createTask({ project_id: p.id, title: "Build", assignee: "Dev" });
    expect(t.status).toBe("todo");
    await expect(
      s.createTask({ project_id: p.id, title: "", assignee: "Dev" }),
    ).rejects.toThrow(/Invalid task title/);
    await expect(
      s.createTask({ project_id: "nope", title: "X", assignee: "Dev" }),
    ).rejects.toThrow(/Invalid project/);
  });

  it("edits a task", async () => {
    const s = svc();
    const p = await s.createProject("Alpha");
    const t = await s.createTask({ project_id: p.id, title: "Build", assignee: "Dev" });
    const updated = await s.updateTask(t.id, { title: "Ship", notes: "hello" });
    expect(updated.title).toBe("Ship");
    expect(updated.notes).toBe("hello");
  });

  it("moves a task between columns and projects", async () => {
    const s = svc();
    const a = await s.createProject("Alpha");
    const b = await s.createProject("Beta");
    const t = await s.createTask({ project_id: a.id, title: "Build", assignee: "Dev" });

    await s.moveTask({ taskId: t.id, project_id: a.id, status: "doing", index: 0 });
    expect(s.getState().tasks[0]!.status).toBe("doing");

    await s.moveTask({ taskId: t.id, project_id: b.id, status: "done", index: 0 });
    const moved = s.getState().tasks[0]!;
    expect(moved.project_id).toBe(b.id);
    expect(moved.status).toBe("done");
  });

  it("reorders within a column and keeps positions contiguous", async () => {
    const s = svc();
    const p = await s.createProject("Alpha");
    const t1 = await s.createTask({ project_id: p.id, title: "One", assignee: "D" });
    await s.createTask({ project_id: p.id, title: "Two", assignee: "D" });
    await s.createTask({ project_id: p.id, title: "Three", assignee: "D" });

    await s.moveTask({ taskId: t1.id, project_id: p.id, status: "todo", index: 2 });
    const order = s
      .getState()
      .tasks.filter((t) => t.status === "todo")
      .map((t) => t.title);
    expect(order).toEqual(["Two", "Three", "One"]);
  });
});

describe("MockBoardService — transport", () => {
  it("blocks writes while disconnected and re-syncs on reconnect", async () => {
    const s = svc();
    const events: string[] = [];
    s.subscribe((e) => events.push(e.type));

    s.setStatus("disconnected");
    await expect(s.createProject("Alpha")).rejects.toThrow(/Could not save changes/);

    s.setStatus("connected");
    expect(s.getStatus()).toBe("connected");
    expect(events.filter((e) => e === "state").length).toBeGreaterThan(1);
  });

  it("broadcasts state to subscribers", async () => {
    const s = svc();
    let count = 0;
    s.subscribe((e) => {
      if (e.type === "state") count += 1;
    });
    await s.createProject("Alpha");
    expect(count).toBe(2); // initial + after create
  });

  it("tracks who is editing a task", async () => {
    const s = svc();
    const p = await s.createProject("Alpha");
    const t = await s.createTask({ project_id: p.id, title: "Build", assignee: "D" });
    let editing: Record<string, string> = {};
    s.subscribe((e) => {
      if (e.type === "presence") editing = e.editing;
    });
    s.setEditing(t.id, "Devaraj");
    expect(editing[t.id]).toBe("Devaraj");
    s.setEditing(null, "Devaraj");
    expect(editing[t.id]).toBeUndefined();
  });
});
