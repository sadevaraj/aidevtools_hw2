import { describe, expect, it } from "vitest";
import { reorder, resolveTaskDrop } from "./dnd";
import type { Task } from "./types";

const task = (over: Partial<Task>): Task => ({
  id: "t",
  project_id: "p1",
  title: "T",
  assignee: "D",
  notes: "",
  status: "todo",
  position: 0,
  created_at: "",
  ...over,
});

const tasks: Task[] = [
  task({ id: "a", position: 0 }),
  task({ id: "b", position: 1 }),
  task({ id: "c", position: 2 }),
];

describe("resolveTaskDrop", () => {
  it("appends when dropping on an empty column", () => {
    const move = resolveTaskDrop(tasks[0]!, { type: "column", projectId: "p2", status: "doing" }, tasks);
    expect(move).toEqual({ taskId: "a", project_id: "p2", status: "doing", index: 0 });
  });

  it("moves down within the same column with index adjustment", () => {
    const move = resolveTaskDrop(
      tasks[0]!,
      { type: "task", projectId: "p1", status: "todo", taskId: "c" },
      tasks,
    );
    expect(move?.index).toBe(2);
  });

  it("moves up within the same column", () => {
    const move = resolveTaskDrop(
      tasks[2]!,
      { type: "task", projectId: "p1", status: "todo", taskId: "a" },
      tasks,
    );
    expect(move?.index).toBe(0);
  });

  it("returns null when nothing changes", () => {
    const move = resolveTaskDrop(
      tasks[0]!,
      { type: "task", projectId: "p1", status: "todo", taskId: "a" },
      tasks,
    );
    expect(move).toBeNull();
  });

  it("inserts at the hovered index across projects", () => {
    const other = [...tasks, task({ id: "z", project_id: "p2", position: 0 })];
    const move = resolveTaskDrop(
      other[0]!,
      { type: "task", projectId: "p2", status: "todo", taskId: "z" },
      other,
    );
    expect(move).toEqual({ taskId: "a", project_id: "p2", status: "todo", index: 0 });
  });
});

describe("reorder", () => {
  it("moves an item", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
});
