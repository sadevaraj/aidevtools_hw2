import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, GripVertical, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { STATUSES, type Project, type Status, type Task } from "@/lib/board/types";
import { Column } from "./Column";

interface Props {
  project: Project;
  tasksFor: (projectId: string, status: Status) => Task[];
  disabled: boolean;
  renderTask: (task: Task) => ReactNode;
  onDelete: () => void;
  onHide: () => void;
  onRename: (name: string) => void;
}

export function ProjectSection({
  project,
  tasksFor,
  disabled,
  renderTask,
  onDelete,
  onHide,
  onRename,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id, data: { type: "project" }, disabled });

  const total = STATUSES.reduce((n, s) => n + tasksFor(project.id, s).length, 0);

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="rounded-lg border border-border bg-card/40 p-4"
      data-testid="project-section"
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Reorder ${project.name}`}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <input
          defaultValue={project.name}
          maxLength={50}
          disabled={disabled}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== project.name) onRename(next);
            else e.target.value = project.name;
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground outline-none hover:border-border focus:border-primary"
        />
        {total === 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={onHide}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <EyeOff className="size-3.5" /> Hide
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" /> Delete
        </button>
      </div>

      <div className="flex gap-4">
        {STATUSES.map((status) => {
          const tasks = tasksFor(project.id, status);
          return (
            <Column
              key={status}
              projectId={project.id}
              status={status}
              taskIds={tasks.map((t) => t.id)}
            >
              {tasks.map((task) => renderTask(task))}
            </Column>
          );
        })}
      </div>
    </section>
  );
}
