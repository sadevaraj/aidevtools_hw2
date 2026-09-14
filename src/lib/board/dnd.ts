import type { MoveTaskInput, Status, Task } from "./types";

export interface DropTarget {
  type: "column" | "task";
  projectId: string;
  status: Status;
  taskId?: string;
}

/**
 * Pure resolver: given the dragged task, the drop target and the current
 * tasks, compute the move request to send to the server.
 */
export function resolveTaskDrop(
  activeTask: Task,
  target: DropTarget,
  tasks: Task[],
): MoveTaskInput | null {
  const column = tasks
    .filter((t) => t.project_id === target.projectId && t.status === target.status)
    .sort((a, b) => a.position - b.position);

  let index = column.length;
  if (target.type === "task" && target.taskId) {
    const overIndex = column.findIndex((t) => t.id === target.taskId);
    if (overIndex >= 0) index = overIndex;
  }

  const sameColumn =
    activeTask.project_id === target.projectId && activeTask.status === target.status;

  if (sameColumn) {
    const from = column.findIndex((t) => t.id === activeTask.id);
    if (from === -1) return null;
    if (from === index) return null;
    if (from < index) index -= 1;
    if (from === index) return null;
  }

  return {
    taskId: activeTask.id,
    project_id: target.projectId,
    status: target.status,
    index,
  };
}

export function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
