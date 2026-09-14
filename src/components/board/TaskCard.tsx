import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Trash2 } from "lucide-react";
import { LIMITS, type Task } from "@/lib/board/types";

interface Props {
  task: Task;
  expanded: boolean;
  editingBy?: string;
  saving: boolean;
  disabled: boolean;
  onExpand: (id: string | null) => void;
  onSave: (patch: { title: string; assignee: string; notes: string }) => void;
  onDelete: () => void;
}

export function TaskCard({
  task,
  expanded,
  editingBy,
  saving,
  disabled,
  onExpand,
  onSave,
  onDelete,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", task },
      disabled: disabled || expanded,
    });

  const [draft, setDraft] = useState({
    title: task.title,
    assignee: task.assignee,
    notes: task.notes,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!expanded) setDraft({ title: task.title, assignee: task.assignee, notes: task.notes });
  }, [expanded, task.title, task.assignee, task.notes]);

  useEffect(() => {
    if (!expanded) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const next = draftRef.current;
        if (
          next.title !== task.title ||
          next.assignee !== task.assignee ||
          next.notes !== task.notes
        ) {
          onSave(next);
        }
        onExpand(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, onExpand, onSave, task.title, task.assignee, task.notes]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (expanded) {
    return (
      <div
        ref={containerRef}
        style={style}
        className="rounded-md border border-primary/60 bg-card p-3 shadow-lg"
        data-testid="task-expanded"
      >
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Title</label>
        <input
          autoFocus
          maxLength={LIMITS.taskTitle}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className="mb-3 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
        />
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Assignee</label>
        <input
          maxLength={LIMITS.assignee}
          value={draft.assignee}
          onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
          className="mb-3 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
        />
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</label>
        <textarea
          maxLength={LIMITS.notes}
          rows={4}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="w-full resize-y rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {editingBy ? `Editing by ${editingBy}` : ""}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !disabled && onExpand(task.id)}
      className="cursor-grab rounded-md border border-border bg-card p-3 transition-colors hover:border-muted-foreground/60 active:cursor-grabbing"
      data-testid="task-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug text-foreground">{task.title}</p>
        {saving && <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{task.assignee}</p>
      {editingBy && (
        <p className="mt-1 text-[11px] text-[color:var(--warning)]">Editing by {editingBy}</p>
      )}
    </div>
  );
}
